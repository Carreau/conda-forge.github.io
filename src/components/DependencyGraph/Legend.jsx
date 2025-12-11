import React from "react";
import graphStyles from "./graphStyles.module.css";

/**
 * LegendItem component that displays a single legend entry with a colored circle and label.
 */
function LegendItem({ colorClass, label }) {
  return (
    <div className={graphStyles.legendItem}>
      <span className={`${graphStyles.legendCircle} ${colorClass}`}></span>
      <span className={graphStyles.legendLabel}>{label}</span>
    </div>
  );
}

/**
 * Legend component that displays the color coding for different node statuses
 * in the migration dependency graph.
 */
export default function Legend() {
  const items = [
    { colorClass: graphStyles.legendSuccess, label: "CI Passing" },
    { colorClass: graphStyles.legendDanger, label: "CI Failing" },
    { colorClass: graphStyles.legendWarning, label: "Bot/Solver Error or Status Unknown" },
    { colorClass: graphStyles.legendAwaitingPr, label: "Awaiting PR" },
    { colorClass: graphStyles.legendAwaitingParents, label: "Awaiting Parents" },
    { colorClass: graphStyles.legendDashed, label: "Awaiting Parent in Another Migration" },
  ];

  return (
    <div className={`${graphStyles.legend} ${graphStyles.legendItems}`}>
      {items.map((item) => (
        <LegendItem key={item.label} colorClass={item.colorClass} label={item.label} />
      ))}
    </div>
  );
}
