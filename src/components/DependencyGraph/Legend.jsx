import React from "react";
import graphStyles from "./graphStyles.module.css";

/**
 * Legend component that displays the color coding for different node statuses
 * in the migration dependency graph.
 */
export default function Legend() {
  return (
    <div className={graphStyles.legend}>
      <div className={graphStyles.legendItems}>
        {/* Legend item: CI Passing */}
        <div className={graphStyles.legendItem}>
          <span className={`${graphStyles.legendCircle} ${graphStyles.legendSuccess}`}></span>
          <span className={graphStyles.legendLabel}>CI Passing</span>
        </div>

        {/* Legend item: CI Failing */}
        <div className={graphStyles.legendItem}>
          <span className={`${graphStyles.legendCircle} ${graphStyles.legendDanger}`}></span>
          <span className={graphStyles.legendLabel}>CI Failing</span>
        </div>

        {/* Legend item: Bot/Solver Error or Status Unknown */}
        <div className={graphStyles.legendItem}>
          <span className={`${graphStyles.legendCircle} ${graphStyles.legendWarning}`}></span>
          <span className={graphStyles.legendLabel}>Bot/Solver Error or Status Unknown</span>
        </div>

        {/* Legend item: Awaiting PR */}
        <div className={graphStyles.legendItem}>
          <span className={`${graphStyles.legendCircle} ${graphStyles.legendAwaitingPr}`}></span>
          <span className={graphStyles.legendLabel}>Awaiting PR</span>
        </div>

        {/* Legend item: Awaiting Parents */}
        <div className={graphStyles.legendItem}>
          <span className={`${graphStyles.legendCircle} ${graphStyles.legendAwaitingParents}`}></span>
          <span className={graphStyles.legendLabel}>Awaiting Parents</span>
        </div>

        {/* Legend item: Awaiting Parent in Another Migration */}
        <div className={graphStyles.legendItem}>
          <span className={`${graphStyles.legendCircle} ${graphStyles.legendDashed}`}></span>
          <span className={graphStyles.legendLabel}>Awaiting Parent in Another Migration</span>
        </div>
      </div>
    </div>
  );
}
