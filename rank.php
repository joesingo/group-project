<?php

<<<<<<< HEAD
    $r = $_REQUEST["r"];

    $data = json_decode($r);

    $data->related_keywords = array("maths", "computer science", "physics");

=======
    ini_set("log_errors", 1);
    ini_set("display_startup_errors", 1);
    error_reporting(E_ALL);
    ini_set("display_errors", "On");

    /*
     * A class to represent that state of the current iterative search
     */
    class IterativeSearchSession {

        function __construct() {
            session_start();

            if (!isset($_SESSION["prev_searches"])) {
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
                $new_results->related_keywords = find_common_keywords($new_results);

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
    function find_common_keywords($results) {
        $k = array("maths", "computer science", "physics");
        return $k;
    }

    $r = $_REQUEST["r"];
    $iter = new IterativeSearchSession();
    $iter_number = $iter->get_iteration_no();

    $data = json_decode($r);

>>>>>>> origin/master
    for($i = 0; $i<count($data->papers); $i++){
        $data->papers[$i]->score = 0;
    }

    for($i = 0; $i<count($data->papers); $i++){
<<<<<<< HEAD
        $year = (int)substr($data->papers[$i]->published_date,0,4);
	$month = (int)substr($data->papers[$i]->published_date,5,7);

	$month_now = (int)date('n');
	$year_now = (int)date('Y');

	$age_yr = $year_now - $year;
	$age_mth = $month_now - $month;

	$inc = 50 - ($age_yr*12 + $age_mth);

	if($inc > 0){
	    $data->papers[$i]->score += $inc;
	}
    }

    function cmp($a, $b){
	if($a->score == $b->score){
	    return 0;
	}

	return ($a->score<$b->score) ? 1:-1;
    }

    usort($data->papers, "cmp");

    echo json_encode($data);
=======
        $year = (int)substr($data->papers[$i]->published_date,6,4);
        $month = (int)substr($data->papers[$i]->published_date,3,2);

        $month_now = (int)date('n');
        $year_now = (int)date('Y');

        $age_yr = $year_now - $year;
        $age_mth = $month_now - $month;

        $inc = 500 - ($age_yr*12 + $age_mth);

        if($inc > 0){
            $data->papers[$i]->score += $inc;
        }
    }


    // Adjust scores in $data->papers based on iteration number. $multiplier
    // is always <= 1 and > 0, and decreases as $iter_number increases
    $multiplier = 1 / (2 * $iter_number) + 0.5;

    foreach ($data->papers as $paper) {
        $paper->score = $paper->score * $multiplier;
    }

    $iter->update_results($data);
    $iter->sort_results();

    $max_iterations = 10;
    $min_papers = 60;  // TODO: Get this from client instead of hardcoding it

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
>>>>>>> origin/master

?>