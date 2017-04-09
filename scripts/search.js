
const API_KEY = "ba079b238ccdab296232e4ce8b9f5b6e";
const SCI_DIR_API_URL = "https://api.elsevier.com/content/search/scidir";
const SCO_API_URL = "https://api.elsevier.com/content/search/scopus";

var SCI_DIR_API_FIELDS = {
    "title": "dc:title",
    "abstract": "dc:description",
    "authors": "authors",
    "published_date": "prism:coverDate",
    "url": "prism:url",
    "total_results": "opensearch:totalResults",
    "keywords": "authkeywords"
};

var SCO_API_FIELDS = {
    "title": "dc:title",
    "abstract": "dc:description",
    "authors": "author",
    "published_date": "prism:coverDate",
    "url": "prism:url",
    "total_results": "opensearch:totalResults",
    "keywords": "authkeywords"
};

// The maximum number of characters to show in the abstract before truncating
var MAX_ABSTRACT_LENGTH = 500;

// Regular expression to match dates in the format DD/MM/YYYY or DD-MM-YYYY
var date_regex = new RegExp(/^(\d\d)[/-](\d\d)[/-](\d\d\d\d)$/);

// Regex to remove field names that can be used in the advanced search so we
// can extract the actual search terms when highlighting keywords
var advanced_search_fields_regexp = new RegExp("(tak|abs|aut|aus|aff|pdt|key|" +
                                               "ref|ttl|title|src|sub|vis|pag)" +
                                               "\\(", "gi")

// Papers per page and current begining of page for moving between papers.
var papersPerPage = 0;
var currentIndex = 0;

// The results put here so it is in scope for recalling show papers from the next function.
var saved;

var $form_elements = $(".Sorting_Filtering input, .Sorting_Filtering select," +
                       ".Searching input, .Searching select");

/*
 * Return a Date object from a string
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
    if (day <= 0 || day > 31 || month <=0 || month > 12 || year <= 0) {
        return null;
    }

    var d = new Date(year, month, day);
    return d;
}

/*
 * Toggle the advanced search help text
 *
 */
function toggleAdvancedSearch() {
    $("#advanced-search-help").toggle();
}

/*
 * Return the search query to send to the API. The format is described at this
 * page: http://api.elsevier.com/documentation/search/SCIDIRSearchTips.htm
 */
function buildQuery(search_terms) {
    return "key(" + search_terms + ") AND abs(" + search_terms + ") AND title(" +
           search_terms + ")";
}

/*
 * Send an AJAX request to the given URL with the given query data. progress
 * stores the results, number failed API calls and total APIs, and callback
 * is called when all APIs have finished
 */
function callAPI(url, query, api_name, progress, callback) {
    $.ajax(url, {"data": query})
        .done(function(data, textStatus, jqXHR) {
            if (data["search-results"][SCI_DIR_API_FIELDS.total_results] > 0) {
                progress.results[api_name] = data["search-results"]["entry"];
            }
            else {
                progress.results[api_name] = [];
            }
        })

        .fail(function(jqXHR, textStatus, errorThrown) {
            progress.errors += 1;
        })

        .always(function() {
            num_finished = Object.keys(progress.results).length + progress.errors;
            if (num_finished == progress.num_apis) {
                callback();
            }
        });
}

/*
 * Send an AJAX request to search ScienceDirect and Scopus with the search query
 * provided and use the filters selected on the page. Call rankResults() when
 * the requests are completed
 */
function search(query, iterative_search) {
    query = query.trim();
    if (!query) {
        return false;
    }

    currentIndex = 0;
    var advanced_search = $("#advanced-search-checkbox").is(":checked");
    var min_papers = $("#Papers-dropdown").val();

    // Query data that is common to both Science Direct and Scopus
    var query_data = {
        "apiKey": API_KEY,
        "httpAccept": "application/json",
        "count": min_papers,
        "sort": "+relevancy",
        "query": (advanced_search && !iterative_search ? query : buildQuery(query))
    };

    // Store the original search term and the filtering applied so that we can
    // pass it to rankResults()
    var filtering = {
        "search_term": query,
        "sort": $("#sort-dropdown").val(),
        "min_papers": min_papers
    };

    // Remove error messages from date inputs if there was an error previously
    $("#date-filter .help-block").text("");
    $("#date-filter .filter-controls").removeClass("has-error");

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
            // Add date range to data to be sent to APIs. Unfortunately the
            // lowest granularity for date filtering is years
            query_data["date"] = start_date.getFullYear() + "-" + end_date.getFullYear();

            filtering["start_date"] = start_date;
            filtering["end_date"] = end_date;
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

    // Create seperate query data for each API since the fields used could be
    // different
    var sci_dir_query_data = JSON.parse(JSON.stringify(query_data));
    sci_dir_query_data.field = Object.values(SCI_DIR_API_FIELDS).join(",");
    var scopus_query_data = JSON.parse(JSON.stringify(query_data));
    scopus_query_data.field = Object.values(SCO_API_FIELDS).join(",");

    $form_elements.prop("disabled", true);

    // Keep track of search progress, since API calls are asynchronous and there
    // is no way of knowing which order the APIs will return
    var search_progress = {
        "num_apis": 2,
        "errors": 0, // The number of failed API calls
        "results": {}
    };

    // Callback function for when all APIs have finished
    var callback = function() {
        if (search_progress.errors == search_progress.num_apis) {
            $("#message").html("Error querying search APIs &#9785; Please try again later");
            $form_elements.prop("disabled", false);
        }
        else {
            rankResults(search_progress.results, filtering, iterative_search);
        }
    }

    callAPI(SCI_DIR_API_URL, sci_dir_query_data, "science_direct",
            search_progress, callback);

    callAPI(SCO_API_URL, scopus_query_data, "scopus", search_progress, callback);
}

/*
 * Format the merged search results from ScienceDirect and Scopus and send
 * them to our server to be ranked, and call showSearchResults() when it is
 * complete. results is an object with a key for each API.
 */
function rankResults(results, filtering, iterative_search) {

    var formatted_results = {
        "query": filtering["search_term"],
        "papers": {}
    };

    for (var api_name in results) {
        var papers = results[api_name];

        if (papers.length > 0) {

            formatted_results.papers[api_name] = [];

            var start_date = filtering.start_date || null;
            var end_date = filtering.end_date || null;

            for (var i=0; i<papers.length; i++) {

                // The link in the search results is an API link - replace the start
                // of it to get the actual link to the paper
                var link = papers[i][SCI_DIR_API_FIELDS.url];

                if (api_name == "science_direct") {
                    link = link.replace("https://api.elsevier.com/content/",
                                        "https://www.sciencedirect.com/science/");
                }
                else if (api_name == "scopus") {
                    link = link.replace("https://api.elsevier.com/content/abstract/scopus_id/",
                                        "https://www.scopus.com/inward/record.uri?partnerID=HzOxMe3b&scp=");
                }

                // Put the author list into a single array
                var authors = [];

                // Check that the authors list is present
                if (SCI_DIR_API_FIELDS.authors in papers[i] && papers[i][SCI_DIR_API_FIELDS.authors] &&
                    "author" in papers[i][SCI_DIR_API_FIELDS.authors]) {

                    var authors_list = papers[i].authors.author;

                    for (var j=0; j<authors_list.length; j++) {
                        authors.push(authors_list[j]["given-name"] + " " +
                                     authors_list[j]["surname"]);
                    }
                }
                else if (papers[i][SCO_API_FIELDS.authors]) {
                    var authors_list = papers[i][SCO_API_FIELDS.authors];

                    for (var j=0; j<authors_list.length; j++) {
                        authors.push(authors_list[j]["given-name"] + " " +
                                     authors_list[j]["surname"]);
                    }
                }
                else {
                    authors = ["N/A"];
                }

                var keywords = [];
                if (papers[i][SCI_DIR_API_FIELDS.keywords]) {
                    keywords = papers[i][SCI_DIR_API_FIELDS.keywords].split(" | ");
                }
                else {
                    keywords = [];
                }

                var date = "";
                if (api_name == "science_direct") {
                    date = papers[i][SCI_DIR_API_FIELDS.published_date][0]["$"];
                }
                else if (api_name == "scopus") {
                    date = papers[i][SCO_API_FIELDS.published_date];
                }

                var p = {
                    "title": papers[i][SCI_DIR_API_FIELDS.title],
                    "link": link,
                    "authors": authors,
                    "published_date": date,
                    "abstract": papers[i][SCI_DIR_API_FIELDS.abstract],
                    "keywords": keywords
                };

                // Convert published date from YYYY-MM-DD to DD-MM-YYYY format
                var d = p.published_date;
                p.published_date = d.substr(8, 2) + "-" + d.substr(5,2) + "-" + d.substr(0, 4);

                // If start date and end date filtering is applied then check the
                // date is in the correct range (since API only filters by year)
                if (start_date !== null && end_date !== null) {
                    var pub_date = parseDate(p.published_date);

                    // Skip if out of range
                    if (pub_date < start_date || pub_date > end_date) {
                        continue;
                    }
                }

                formatted_results.papers[api_name].push(p);
            }
        }
    }

    // Send formatted_results to our server via AJAX to do the ranking and
    // get related keywords, and call showSearchResults() when finished
    $.ajax("rank.php", {
        "method": "POST",
        "data": {
            "r":  JSON.stringify(formatted_results),
            "sort": filtering["sort"],
            "min_papers": filtering["min_papers"],
            "initial_search": !iterative_search
        },

        "error": function() {
            $("#message").text("Unexpected error ranking results:(");
            $form_elements.prop("disabled", false);
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
    $form_elements.prop("disabled", false);
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
            "text": keywords_matches + " matches"
        })

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
