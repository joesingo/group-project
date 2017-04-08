<?php

    ini_set("log_errors", 1);
    ini_set("display_startup_errors", 1);
    error_reporting(E_ALL);
    ini_set("display_errors", "On");

    /*
     * A class to represent that state of the current iterative search
     */
    class IterativeSearchSession {

        function __construct($initial_search) {

            // Change the session path to avoid permission errors that seem to
            // occasionally happen on users server
            session_save_path(".");

            session_start();

            if (!isset($_SESSION["prev_searches"]) || $initial_search) {
                $_SESSION["prev_searches"] = array();
                $_SESSION["prev_results"] = array();
                $_SESSION["debug"] = array();
                $_SESSION["iteration_no"] = 1;
            }
        }

        function get_iteration_no() {
            return $_SESSION["iteration_no"];
        }

        function get_num_papers() {
            return count($_SESSION["prev_results"]->papers);
        }

        function get_related_keywords() {
            return $_SESSION["prev_results"]->related_keywords;
        }

        function update_results($new_results) {
            if ($this->get_iteration_no() == 1) {

                // Find common keywords from the first search
                $new_results->related_keywords = find_common_keywords($new_results,
                                                                      $new_results->query);

                $_SESSION["prev_results"] = $new_results;
            }
            else {
                $p = $_SESSION["prev_results"]->papers;
                $_SESSION["prev_results"]->papers = array_merge(
                    $p, $new_results->papers
                );
            }
        }

        function iterative_search($query) {
            // Add this search query to the list of previous searches
            $_SESSION["prev_searches"][] = $query;
            $_SESSION["iteration_no"] += 1;

            echo '{"iterative_search": "' . $query . '"}';
            exit();
        }

        /*
         * Send the results back to the client and clear all session variables
         */
        function send_results() {
            $_SESSION["prev_results"]->debug = $_SESSION["debug"];
            echo json_encode($_SESSION["prev_results"]);
            session_destroy();
            exit();
        }

        /*
         * The comparison function for scoring papers
         */
        function cmp($a, $b){
            if($a->score == $b->score){
                return 0;
            }

            return ($a->score<$b->score) ? 1:-1;
        }

        function sort_results() {
            usort($_SESSION["prev_results"]->papers, array($this, "cmp"));
        }

        /*
         * Append $message to debug messages
         */
        function debug($message) {
            $_SESSION["debug"][] = $message;
        }
    }

    /*
     * Return an array of top most common keywords from the search results
     * provided
     */
    function find_common_keywords($results, $original_query) {
        $I=0;
        $key_word_list = array();

        foreach ($results->papers as $paper) {

            foreach($paper->keywords as $item){
                $itemm = strtolower($item);

                if (array_key_exists($itemm, $key_word_list)) {
                    $key_word_list[$itemm] = $key_word_list[$itemm] + 1;
                }
                else if ($itemm != strtolower($original_query)) {
                    $key_word_list[$itemm] = 1;
                }
            }
        }

        arsort($key_word_list);

        $k = array_keys($key_word_list);
        $k = array_slice($k, 0, 10);
        return $k;
    }

    // Constants for different sorting criteria
    // NOTE: These need to match the values in sort dropdown in HTML file
    define("RELEVANCE", "relevance");
    define("DATE_ASC", "date_asc");
    define("DATE_DESC", "date_desc");

    $r = $_REQUEST["r"];
    $initial_search = ($_REQUEST["initial_search"] == "true" ? true : false);
    $iter = new IterativeSearchSession($initial_search);
    $iter_number = $iter->get_iteration_no();

    $data = json_decode($r);

    foreach ($data->papers as $api => $papers) {
        foreach ($papers as $paper) {
            $paper->score = 0;
        }
    }

    // NOTE: This relies on the user not changing the sort order in between
    // iterative searches!
    $sort = $_REQUEST["sort"];

    if ($sort == DATE_ASC || $sort == DATE_DESC) {
        // Sort by date

        // Go through the papers from each API
        foreach ($data->papers as $api => $papers) {

            foreach ($papers as $paper) {
                $year = (int)substr($paper->published_date,6,4);
                $month = (int)substr($paper->published_date,3,2);

                $month_now = (int)date('n');
                $year_now = (int)date('Y');

                $age_yr = $year_now - $year;
                $age_mth = $month_now - $month;

                $total_age = $age_yr*12 + $age_mth;

                // If sorting by date descending then smallest age is best, so score
                // should be -$total_age
                $sign = ($sort == DATE_DESC ? -1 : 1);
                $paper->score = $sign * $total_age;
            }
        }
    }

    else if ($sort == RELEVANCE) {
        foreach ($data->papers as $api => $papers) {
            // Results from API are returned sorted by relevance, so first paper
            // gets score 0, seconds gets -1, third gets -2 and so on.
            foreach ($papers as $i => $paper) {
                $paper->score = -$i;
            }
        }
    }

    // Now that papers from different APIs have been scored they can be combined
    // into a single array
    $all_papers = array();
    foreach ($data->papers as $api => $papers) {
        $all_papers = array_merge($all_papers, $papers);
    }

    $data->papers = $all_papers;

    // Adjust scores in $data->papers based on iteration number. $multiplier
    // is always <= 1 and > 0, and decreases as $iter_number increases
    $multiplier = 1 / (2 * $iter_number) + 0.5;

    foreach ($data->papers as $paper) {
        $paper->score = $paper->score * $multiplier;
    }

    $iter->update_results($data);
    $iter->sort_results();

    $max_iterations = 10;
    $min_papers = $_REQUEST["min_papers"];

    $related_keywords = $iter->get_related_keywords();

    // Perform iterative search if we do not have enough papers, have not
    // exceeded maximum iterations, and there are still related keywords left
    if ($iter->get_num_papers() < $min_papers && $iter_number < $max_iterations &&
        $iter_number <= count($related_keywords)) {

        $iter->iterative_search($related_keywords[$iter_number - 1]);
    }

    // If reached here then we are not doing any more searches, so send final
    // results
    $iter->send_results();

?>