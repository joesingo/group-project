<?php

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
            }
        }

        function get_iteration_no() {
            return count($_SESSION["prev_searches"]) + 1;
        }

        function update_results($new_results) {
            if ($this->get_iteration_no() == 1) {
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
            // Add this search query to the list of previous searches and
            // related keywords
            $_SESSION["prev_searches"][] = $query;
            $_SESSION["prev_results"]->related_keywords[] = $query;

            echo '{"iterative_search": "' . $query . '"}';
            exit();
        }

        /*
         * Send the results back to the client and clear all session variables
         */
        function send_results() {
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
    }

    $r = $_REQUEST["r"];

    $data = json_decode($r);

    $data->related_keywords = array("maths", "computer science", "physics");

    for($i = 0; $i<count($data->papers); $i++){
        $data->papers[$i]->score = 0;
    }

    for($i = 0; $i<count($data->papers); $i++){
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

    $iter = new IterativeSearchSession();

    // Adjust scores in $data->papers based on $iter->get_iteration_no()

    // Only use the first 5 papers for demonstration purposes
    $data->papers = array_slice($data->papers, 0, 5);

    $iter->update_results($data);
    $iter->sort_results();

    // This bit is for demo purposes
    switch ($iter->get_iteration_no()) {
        case 1:
            $iter->iterative_search("frog");
            break;

        case 2:
            $iter->iterative_search("cat");
            break;

        default:
            $iter->send_results();
    }

?>