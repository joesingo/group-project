/*
 * The base for Science Direct and Scopus APIs
 */
function BaseAPI(name) {
    this.name = name;
    this.key = "ba079b238ccdab296232e4ce8b9f5b6e";

    this.api_fields = {
        "title": "dc:title",
        "abstract": "dc:description",
        "published_date": "prism:coverDate",
        "url": "prism:url",
        "total_results": "opensearch:totalResults",
        "keywords": "authkeywords"
    };

    /*
     * Convert the given search query into the format to be sent to the API server
     */
    this.formatQuery = function(search_terms, advanced_search, author) {
        var q = "";

        if (advanced_search) {
            q = search_terms;

            // Convert aut -> author-name for scopus advanced search language
            if (this.name == SCOPUS) {
                var r = new RegExp("aut\\(", "gi");
                q = q.replace(r, "author-name(");
            }
        }
        else {
            q = "key(" + search_terms + ") AND abs(" + search_terms + ") AND " +
                "title(" + search_terms + ")";
        }

        if (typeof(author) !== "undefined") {
            q = "(" + q + ") AND aut(" + author + ")";
        }

        return q;
    }

    /*
     * Return the data to be sent in the AJAX request to the API server.
     * search_options is of the form
     *  {
     *    "search_term": "...",
     *    "sort": "...",
     *    "min_papers": <num papers>,
     *    "advanced_search": <boolean>
     *  }
     * It may also have "start_date" and "end_date" (JS Date objects) if date
     * filtering is being applied, and "author" (string) if author filtering is
     * applied
     */
    this.buildQuery = function(search_options) {
        var search_query = this.formatQuery(search_options.search_term,
                                            search_options.advanced_search,
                                            search_options.author);
        var q = {
            "apiKey": this.key,
            "httpAccept": "application/json",
            "count": search_options.min_papers,
            // Only sort by relevance, since date sorting is done server side
            "sort": "+relevancy",
            "field": Object.values(this.api_fields).join(","),
            "query": search_query
        }

        if ("start_date" in search_options && "end_date" in search_options) {
            // Add date range to data to be sent to API. Unfortunately the
            // lowest granularity for date filtering is years
            q.date = search_options.start_date.getFullYear() + "-" +
                     search_options.end_date.getFullYear();
        }

        return q;
    }

    /*
     * Return a list of papers of the form
     *   {
     *    "title": "...",
     *    "link": "...",
     *    "authors": ["...", ...],
     *    "published_date": "DD-MM-YYYY",
     *    "abstract": "...",
     *    "citations": <No. of citations or null if N/A>
     *    "keywords": ["...", ...]
     *  }
     */
    this.formatResults = function(response, search_options) {
        if (response["search-results"][this.api_fields.total_results] == 0) {
            return [];
        }

        var formatted_results = [];
        var papers = response["search-results"]["entry"];

        for (var i=0; i<papers.length; i++) {

            var link = papers[i][this.api_fields.url];
            var authors = [];
            var date = "";
            var citations = null;

            if (this.name == SCIENCE_DIRECT) {
                // The link in the search results is an API link - replace the start
                // of it to get the actual link to the paper
                link = link.replace("https://api.elsevier.com/content/",
                                    "https://www.sciencedirect.com/science/");

                // Check that the authors list is present
                if (this.api_fields.authors in papers[i] && papers[i][this.api_fields.authors] &&
                    "author" in papers[i][this.api_fields.authors]) {

                    var authors_list = papers[i].authors.author;

                    for (var j=0; j<authors_list.length; j++) {
                        authors.push(authors_list[j]["given-name"] + " " +
                                     authors_list[j]["surname"]);
                    }
                }

                date = papers[i][this.api_fields.published_date][0]["$"];
            }
            else if (this.name == SCOPUS) {
                link = link.replace("https://api.elsevier.com/content/abstract/scopus_id/",
                                    "https://www.scopus.com/inward/record.uri?partnerID=HzOxMe3b&scp=");

                if (papers[i][this.api_fields.authors]) {
                    var authors_list = papers[i][this.api_fields.authors];

                    for (var j=0; j<authors_list.length; j++) {
                        authors.push(authors_list[j]["given-name"] + " " +
                                     authors_list[j]["surname"]);
                    }
                }

                date = papers[i][this.api_fields.published_date];

                citations = papers[i][this.api_fields.citations];
            }

            if (authors.length == 0) {
                authors = ["N/A"];
            }

            var keywords = [];
            if (papers[i][this.api_fields.keywords]) {
                keywords = papers[i][this.api_fields.keywords].split(" | ");
            }

            var p = {
                "title": papers[i][this.api_fields.title],
                "link": link,
                "authors": authors,
                "published_date": date,
                "abstract": papers[i][this.api_fields.abstract],
                "citations": citations,
                "keywords": keywords
            };

            // Convert published date from YYYY-MM-DD to DD-MM-YYYY format
            var d = p.published_date;
            p.published_date = d.substr(8, 2) + "-" + d.substr(5,2) + "-" + d.substr(0, 4);

            var start_date = search_options.start_date || null;
            var end_date = search_options.end_date || null;

            // If start date and end date filtering is applied then check the
            // date is in the correct range (since API only filters by year)
            if (start_date !== null && end_date !== null) {
                var pub_date = parseDate(p.published_date);

                // Skip if out of range
                if (pub_date < start_date || pub_date > end_date) {
                    continue;
                }
            }

            formatted_results.push(p);
        }

        return formatted_results;
    };
}

const SCIENCE_DIRECT = "Science Direct";
const SCOPUS = "Scopus";

var sci_dir_api = new BaseAPI(SCIENCE_DIRECT);
sci_dir_api.api_fields.authors = "authors";
sci_dir_api.url = "https://api.elsevier.com/content/search/scidir";

var scopus_api = new BaseAPI(SCOPUS);
scopus_api.api_fields.authors = "author";
scopus_api.api_fields.citations = "citedby-count";
scopus_api.url = "https://api.elsevier.com/content/search/scopus";

