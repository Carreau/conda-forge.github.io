import React from "react";
import graphStyles from "./graphStyles.module.css";

/**
 * SettingsPanel component provides controls for customizing the graph visualization.
 * Includes toggles for showing completed packages and options for graph layout settings.
 */
export default function SettingsPanel({
  showDoneNodes,
  onShowDoneNodesChange,
  graphDirection,
  onGraphDirectionChange,
  graphRanker,
  onGraphRankerChange,
  graphAlign,
  onGraphAlignChange,
}) {
  return (
    <div className={graphStyles.settingsPanel}>
      {/* Beginning of top-right settings panel */}

      {/* Toggle for showing completed packages */}
      <div className={graphStyles.toggleContainer}>
        <label className={graphStyles.toggleLabel}>
          <span>Include completed packages</span>
          <input
            type="checkbox"
            className={graphStyles.toggleInput}
            checked={showDoneNodes}
            onChange={(e) => onShowDoneNodesChange(e.target.checked)}
          />
          <span className={graphStyles.toggleSlider}></span>
        </label>
      </div>

      {/* Graph layout configuration grid */}
      <div className={graphStyles.settingsGrid}>
        {/* Direction selector */}
        <div>
          <label className={graphStyles.settingLabel}>Direction</label>
          <select
            id="graph-direction"
            className={graphStyles.settingSelect}
            value={graphDirection}
            onChange={(e) => onGraphDirectionChange(e.target.value)}
          >
            <option value="TB">Top to Bottom</option>
            <option value="BT">Bottom to Top</option>
            <option value="LR">Left to Right</option>
            <option value="RL">Right to Left</option>
          </select>
        </div>

        {/* Ranker selector */}
        <div>
          <label className={graphStyles.settingLabel}>Ranker</label>
          <select
            id="graph-ranker"
            className={graphStyles.settingSelect}
            value={graphRanker}
            onChange={(e) => onGraphRankerChange(e.target.value)}
          >
            <option value="network-simplex">Network Simplex</option>
            <option value="tight-tree">Tight Tree</option>
            <option value="longest-path">Longest Path</option>
          </select>
        </div>

        {/* Alignment selector */}
        <div>
          <label className={graphStyles.settingLabel}>Alignment</label>
          <select
            id="graph-align"
            className={graphStyles.settingSelect}
            value={graphAlign}
            onChange={(e) => onGraphAlignChange(e.target.value)}
          >
            <option value="">Center (default)</option>
            <option value="UL">Upper Left</option>
            <option value="UR">Upper Right</option>
            <option value="DL">Down Left</option>
            <option value="DR">Down Right</option>
          </select>
        </div>
      </div>

      {/* End of top-right settings panel */}
    </div>
  );
}
