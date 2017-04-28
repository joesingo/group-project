// The maximum number of characters to show in the abstract before truncating
var MAX_ABSTRACT_LENGTH = 500;

// Regular expression to match dates in the format DD/MM/YYYY or DD-MM-YYYY
var date_regex = new RegExp(/^(\d\d)[/-](\d\d)[/-](\d\d\d\d)$/);

// Regex to remove field names that can be used in the advanced search so we
// can extract the actual search terms when highlighting keywords
var advanced_search_fields_regexp = new RegExp("(abs|aut|doi|key|ref|scrtitle|" +
                                               "title-abs-key|tak|title)\\(", "gi");

// Papers per page and current begining of page for moving between papers.
var papersPerPage = 0;
var currentIndex = 0;

// The results put here so it is in scope for recalling show papers from the next function.
var saved;

var $form_elements = $(".Sorting_Filtering input, .Sorting_Filtering select," +
                       ".Searching input, .Searching select");

var apis = [sci_dir_api, scopus_api];

/*
 * Disable the search/sorting/filtering inputs whilst a search is in progress
 */
function disableInputs() {
    $form_elements.each(function(i, el) {
        el.setAttribute("data-prev-state", el.disabled);
        el.disabled = true;
    });
}

function enableInputs() {
    $form_elements.each(function(i, el) {
        var prev_state = el.getAttribute("data-prev-state");
        el.disabled = (prev_state === "true");  // Convert to boolean from string
    });
}

/*
 * Return a Date object from a string in the format DD/MM/YYYY or DD-MM-YYYY
 */
function parseDate(date_text) {
    var res = date_regex.exec(date_text);

    // Return null if the date string did not match the regex
    if (!res) {
        return null;
    }

    var day = parseInt(res[1]);
    var month = parseInt(res[2]);
    var year = parseInt(res[3]);

    // Return null is any of day, month or year are out of range
    if (day <= 0 || day > 31 || month <= 0 || month > 12 || year <= 0) {
        return null;
    }

    var d = new Date(year, month - 1, day);  // -1 since Jan is 0, Feb 1 etc...
    return d;
}

/*
 * Toggle the advanced search help text (which shows link to popup help)
 *
 */
function toggleAdvancedSearch() {
    $("#advanced-search-help").toggle();
}

/*
 * Toggle the advanced search help popup
 */
function toggleAdvancedSearchHelp() {
    $("#advanced-search-help-popup, #gray-screen").toggle();
}

/*
 * Send an AJAX request to each search API with the search query provided and
 * use the filters selected on the page. Call rankResults() when the requests
 * are completed
 */
function search(query, iterative_search) {
    query = query.trim();
    if (!query) {
        return false;
    }

    currentIndex = 0;

    // Store the original search term, filtering applied, paper count and
    // whether this is an advanced search
    var search_options = {
        "search_term": query,
        "sort": $("#sort-dropdown").val(),
        "min_papers": $("#Papers-dropdown").val(),
        "advanced_search": $("#advanced-search-checkbox").is(":checked") && !iterative_search
    };

    // Remove error messages if there was an error previously
    $(".Sorting_Filtering .help-block").text("");
    $(".Sorting_Filtering .filter-controls").removeClass("has-error");

    // If date filtering is selected...
    if ($("#date-filter input[type=checkbox]").is(":checked")) {
        var $date_boxes = $("#date-filter .date-input");

        var start_date = parseDate($date_boxes[0].value);
        var end_date = parseDate($date_boxes[1].value);

        if (!start_date || !end_date) {
            $date_boxes.parent().addClass("has-error");
            $("#date-filter .help-block").text("Invalid start/end date");
            return false;
            }

        else if (start_date >= end_date) {
            $("#date-filter .help-block").text("Start date must be before end date");
            return false;
        }

        else {
            search_options.start_date = start_date;
            search_options.end_date = end_date;
        }
    }

    // If author filtering is selected...
    if ($("#author-filter input[type=checkbox]").is(":checked")) {
        var $box = $("#author-filter input[type=text]");
        var author = $box.val().trim();

        if (!author) {
            $box.parent().addClass("has-error");
            $("#author-filter .help-block").text("Invalid author");
            return false;
        }
        else {
            search_options.author = author;
        }
    }

    if (iterative_search) {
        $("#message").text("Searching for '" + query + "'...").show();;
    }
    else {
        $("#search-results").children().hide();
        $("#message").text("Loading...").show();;

        $("#search-area input").val(query);
        $("#search-area input").blur();
    }

    disableInputs();

    // Keep track of search progress, since API calls are asynchronous and there
    // is no way of knowing which order the APIs will return
    var search_progress = {
        "num_apis": apis.length,
        "errors": 0, // The number of failed API calls
        "results": {}  // Store formatted papers from each API
    };

    // Callback function for when all APIs have finished
    var callback = function() {
        if (search_progress.errors == search_progress.num_apis) {
            $("#message").html("Error querying search APIs &#9785; Please try again later");
            enableInputs();
        }
        else {
            rankResults(search_progress.results, search_options, iterative_search);
        }
    }

    // Make an AJAX request for each API
    for (var i=0; i<apis.length; i++) {

        var data = apis[i].buildQuery(search_options);

        $.ajax(apis[i].url, {"data": data, "context": apis[i]})
            .done(function(data, textStatus, jqXHR) {
                // Note: this refers to the api object
                search_progress.results[this.name] = this.formatResults(data, search_options);
            })

            .fail(function(jqXHR, textStatus, errorThrown) {
                search_progress.errors += 1;
            })

            // This callback is executed regardless of success or failure
            .always(function() {
                var num_finished = Object.keys(search_progress.results).length + search_progress.errors;
                if (num_finished == search_progress.num_apis) {
                    callback();
                }
            });
    }
}

/*
 * Send the results from each API to our server to be ranked, and call
 * showSearchResults() when it is complete. results is an object with a key for
 * each API containing a list of formatted papers
 */
function rankResults(results, search_options, iterative_search) {

    var formatted_results = {
        "query": search_options["search_term"],
        "papers": {}
    };

    for (var api_name in results) {
        formatted_results.papers[api_name] = results[api_name];
    }

    // Send formatted_results to our server via AJAX to do the ranking and
    // get related keywords, and call showSearchResults() when finished
    $.ajax("rank.php", {
        "method": "POST",
        "data": {
            "r":  JSON.stringify(formatted_results),
            "sort": search_options["sort"],
            "min_papers": search_options["min_papers"],
            "initial_search": !iterative_search
        },

        "error": function() {
            $("#message").text("Unexpected error ranking results:(");
            enableInputs();
        },

        "success": function(data, textStatus) {
            var temp = JSON.parse(data);

            if ("iterative_search" in temp) {
                search(temp["iterative_search"], true);
            }
            else {
                for (var i=0; i<temp.debug.length; i++) {
                    console.log("DEBUG: " + temp.debug[i]);
                }
                saved = temp;
                showSearchResults(temp);
            }
        }
    });
}

/*
 * Find the given keywords in the given string of text and wrap them in a span
 * tag so they can be highlighted. Return an object containing the new text and
 * the number of matches
 */
function highlightKeywords(text, keywords) {
    var regexp = new RegExp(keywords.join("|"), "gi");
    var matches = 0;

    var replacer = function(match) {
        matches++;
        return "<span class='highlight'>" + match + "</span>";
    }

    var new_text = text.replace(regexp, replacer);
    return {
        "text": new_text,
        "matches": matches
    };
}

/*
 * Show the whole abstract for a paper for when the abstract is over
 * MAX_ABSTRACT_LENGTH characters and is truncated. This is called when the
 * 'Show more' link is cliced
 */
function showMoreAbstract(link) {
    var $more_span = $(link).parent();
    var $abstract = $more_span.parent();

    $more_span.hide();
    $abstract.find(".hidden").removeClass("hidden");
}

/*
 * Show the actual search results on the page
 */
function showSearchResults(results) {
    $("#no-of-results").text(results.papers.length);
    $("#search-query").text(results.query);
    $("#results-list").text("");
    $("#related-keywords").text("");
    $("#related-keywords").parent().show();

    $("#search-results").children().show();
    $("#message").hide();
    enableInputs();
    $("#page-navigation").show();

    if (results.papers.length == 0) {
        $("#page-navigation").hide();
        $("#related-keywords").parent().hide();
        return;
    }

    // Show the related keywords
    for (let i=0; i<results.related_keywords.length; i++) {
        var $link = $("<a>", {"href": "#", "text": results.related_keywords[i]})
        $link.on("click",
            function() {
                search(results.related_keywords[i]);
            }
        );
        $("#related-keywords").append($link);

        if (i + 1 < results.related_keywords.length) {
            $("#related-keywords").append(", ");
        }
    }

    var advanced_search = $("#advanced-search-checkbox").is(":checked");
    if (advanced_search) {
        // 1. Remove field names (e.g. abs, ttl, ref)
        // 2. Remove AND, OR, NOT and brackets
        results.query = results.query.replace(advanced_search_fields_regexp, "")
                                     .replace(/AND|OR|NOT|\(|\)/gi, "");
    }

    // Remove excessive whitespace and split by space to get keywords
    var keywords = results.query.replace(/\s+/g, " ").split(" ");

    // Remove stop words from keywords since they do not need to be highlighted
    for (var i=0; i<keywords.length; i++) {
        if (STOP_WORDS.indexOf(keywords[i].toLowerCase()) != -1) {
            keywords.splice(i, 1);
            i--;
        }
    }

    papersPerPage = parseInt(document.getElementById("perPage").value);

    document.getElementById("results-list").setAttribute("start", currentIndex + 1);

    var current_page = 1 + currentIndex / papersPerPage;
    var total_pages = Math.ceil(saved.papers.length / papersPerPage);
    $("#current-page").html(current_page);
    $("#total-pages").html(total_pages);

    // Hide prev/next link if on first/last page
    $("#page-navigation a").prop("hidden", false);
    if (current_page == 1) {
        $("#page-navigation a.prev").prop("hidden", true);
    }
    else if (current_page == total_pages) {
        $("#page-navigation a.next").prop("hidden", true);
    }

    // Show the papers
    for (var i=currentIndex; i<results.papers.length && i<currentIndex + papersPerPage; i++) {

        var keywords_matches = 0;

        var hi_title = highlightKeywords(results.papers[i].title, keywords);
        keywords_matches += hi_title.matches;

        var $link = $("<a>", {
            "href": results.papers[i].link,
            "html": hi_title.text,
            "class": "paper-title"
        });

        var $authors = $("<span>", {
            "text": results.papers[i].authors.join(", "),
            "class": "authors"
        });

        var $date = $("<span>", {
            "text": "Published " + results.papers[i].published_date,
            "class": "published-date"
        });

        var abstract = results.papers[i].abstract || "No abstract available";

        // Some abstracts seem to start with the word 'Abstract' which is
        // not necessary to show
        if (abstract.substr(0, 8) == "Abstract") {
            abstract = abstract.substr(8);
        }

        var abstract_html = "";

        // Trim the abstract if it is too long
        if (abstract.length > MAX_ABSTRACT_LENGTH) {
            var more_link = "<a onclick='showMoreAbstract(this)' " +
                                "class='show-more-link'>Show more</a>";
            var show_more_span = "<span>..." + more_link + "</span>";

            // Split the abstract up into shown part and hidden part
            var shown_excerpt = abstract.substr(0, MAX_ABSTRACT_LENGTH);
            var hidden_excerpt = abstract.substr(MAX_ABSTRACT_LENGTH);

            // Highlight shown and hidden parts and increase match counter
            var hi_shown = highlightKeywords(shown_excerpt, keywords);
            var hi_hidden = highlightKeywords(hidden_excerpt, keywords);
            keywords_matches += hi_shown.matches;
            keywords_matches += hi_hidden.matches;

            abstract_html = hi_shown.text + show_more_span + "<span class='hidden'>" +
                            hi_hidden.text + "</span>";
        }
        else {
            var hi_abs = highlightKeywords(abstract, keywords);
            keywords_matches += hi_abs.matches;

            abstract_html = hi_abs.text;
        }

        var $p = $("<p>", {
            "html": abstract_html,
            "class": "abstract-excerpt"
        });

        var $p2 = $("<p>", {
            "html": "<b>" + keywords_matches + "</b> matches"
        })

        if (results.papers[i].citations !== null) {
            $p2.append(", <b>" + results.papers[i].citations + "</b> citations")
        }
        else {
            $p2.append(", citations N/A");
        }

        var $li = $("<li>");
        $li.append($link, "<br />", $authors, $date, $p, $p2);
        $("#results-list").append($li);
    }
}

function next(status){
    if (status == 0) {
        currentIndex -= papersPerPage;
        if (currentIndex < 0) {
            currentIndex = 0;
        }
    }
    else {
        if (currentIndex + 2*papersPerPage <= saved.papers.length) {
            currentIndex += papersPerPage;
        }
        else {
            currentIndex = saved.papers.length - papersPerPage;
       }
    }

    showSearchResults(saved);
}

/*
 * Enable/disable the controls for a filter when the checkbox is
 * checked/unchecked
 */
function toggleFilter(checkbox) {

    var $el = $(checkbox);
    while (!($el.hasClass("filter"))) {
        $el = $el.parent();
    }

    var $inputs = $el.find(".filter-controls input");

    $inputs.each(function (index, input) {
        input.disabled = !checkbox.checked;
    });
}

// Enable or disable all the filter controls so that they match the state of
// the checkboxes
var checkboxes = document.querySelectorAll(".filter input[type=checkbox]");
for (var i=0; i<checkboxes.length; i++) {
    checkboxes[i].onchange();
}

$(document).ready(function() {
    // Hide the search results area
    $("#search-results").children().hide();
    $("#message").show();
});
