<?php

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

    function cmp($a, $b){
	if($a->score == $b->score){
	    return 0;
	}

	return ($a->score<$b->score) ? 1:-1;
    }

    usort($data->papers, "cmp");

    echo json_encode($data);

?>