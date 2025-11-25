import { Redirect, useLocation } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { urls } from "@site/src/constants";
import Admonition from "@theme/Admonition";
import Layout from "@theme/Layout";
import React, { useEffect, useState } from "react";
import SVG from 'react-inlinesvg';
import styles from "./styles.module.css";
import { Tooltip } from "react-tooltip";
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import * as dagreD3 from "dagre-d3-es";
import * as d3 from "d3";

// GitHub GraphQL MergeStateStatus documentation
// Reference: https://docs.github.com/en/graphql/reference/enums#mergestatestatus
const CI_STATUS_DESCRIPTIONS = {
  clean: "Mergeable and passing commit status.",
  unstable: "Mergeable with non-passing commit status.",
  behind: "The head ref is out of date.",
  blocked: "The merge is blocked.",
  dirty: "The merge commit cannot be cleanly created.",
  draft: "The merge is blocked due to the pull request being a draft.",
  has_hooks: "Mergeable with passing commit status and pre-receive hooks.",
  unknown: "The state cannot currently be determined."
};

// { Done, In PR, Awaiting PR, Awaiting parents, Not solvable, Bot error }
// The third value is a boolean representing the default display state on load
// 'true' means hidden, 'false' means visible
const ORDERED = [
  ["done", "Done", true],
  ["in-pr", "In PR", false],
  ["awaiting-pr", "Awaiting PR", false],
  ["awaiting-parents", "Awaiting parents", false],
  ["not-solvable", "Not solvable", false],
  ["bot-error", "Bot error", false],
];

const TITLES = ORDERED.reduce((titles, [key, title]) =>
  ({ ...titles, [key]: title }), {});

const VIEW_KEY = "migration-toggle";

export function measureProgress(details) {
  const done = details["done"].length + details["in-pr"].length;
  const total =
    done +
    details["awaiting-parents"].length +
    details["awaiting-pr"].length +
    details["bot-error"].length +
    details["not-solvable"].length;
  const percentage = (done / (total || 1)) * 100;
  return { done, percentage, total };
}

function getStatusBadgeClass(prStatus) {
  switch (prStatus) {
    case "clean":
      return "success";
    case "unstable":
      return "danger";
    case "draft":
      return "secondary";
    case "behind":
    case "blocked":
    case "dirty":
      return "warning";
    case "has_hooks":
      return "info";
    case "unknown":
    default:
      return "secondary";
  }
}

export default function MigrationDetails() {
  const location = useLocation();
  const { siteConfig } = useDocusaurusContext();
  const [state, setState] = useState({
    name: new URLSearchParams(location.search).get("name"),
    details: null,
    redirect: false,
    view: "table",
  });
  const toggle = (view) => {
    if (window && window.localStorage) {
      try {
        window.localStorage.setItem(VIEW_KEY, view);
      } catch (error) {
        console.warn(`error writing to local storage`, error);
      }
    }
    setState((prev) => ({ ...prev, view }));
  };
  useEffect(() => {
    if (!state.name) return setState((prev) => ({ ...prev, redirect: true }));
    let view = "";
    if (window && window.localStorage) {
      try {
        view = window.localStorage.getItem(VIEW_KEY);
      } catch (error) {
        console.warn(`error reading from local storage`, error);
      }
    }
    void (async () => {
      try {
        const url = urls.migrations.details.replace("<NAME>", state.name);
        const details = await (await fetch(url)).json();
        details.progress = measureProgress(details);
        details.paused_or_closed = await checkPausedOrClosed(name);
        setState((prev) => ({ ...prev, details, view: view || prev.view }));
      } catch (error) {
        console.warn(`error loading migration: ${state.name}`, error);
        setState((prev) => ({ ...prev, redirect: true }));
      }
    })();
  }, []);
  if (state.redirect) return <Redirect to="/status" replace />;
  const { details, name, view } = state;
  return (
    <Layout
      title={siteConfig.title}
      description="Status dashboard for conda-forge"
    >
      <main className={`container ${styles.migration_details}`}>
        <div className={`card margin-top--xs`}>
          <div className="card__header">
            <div className={styles.migration_details_toggle}>
              <div class="tabs-container">
                <ul role="tablist" aria-orientation="horizontal" class="tabs">
                  <li
                    key="table"
                    role="tab"
                    class={["tabs__item", (view == "table" ? "tabs__item--active" : null)].join(" ")}
                    onClick={() => toggle("table")}
                  >
                    Table
                  </li>
                  <li
                    key="graph"
                    role="tab"
                    class={["tabs__item", (view == "graph" ? "tabs__item--active" : null)].join(" ")}
                    onClick={() => toggle("graph")}
                  >
                    Graph
                  </li>
                  <li
                    key="impact"
                    role="tab"
                    class={["tabs__item", (view == "impact" ? "tabs__item--active" : null)].join(" ")}
                    onClick={() => toggle("impact")}
                  >
                    Impact
                  </li>
                  {name &&
                    <a href={urls.migrations.details.replace("<NAME>", name)} target="_blank">
                      <li
                        key="raw"
                        role="tab"
                        class="tabs__item"
                      >
                        <span>Raw <i className="fa fa-fw fa-arrow-up-right-from-square"></i></span>
                      </li>
                    </a>
                  }
                </ul>
              </div>
            </div>
            <Breadcrumbs>{name}</Breadcrumbs>
            <div style={{ clear: "both" }}></div>
          </div>
          <div className="card__body" style={{ overflow: "auto" }}>
            {(details && details.paused_or_closed === "paused") ?
              <Admonition type="note">This migration is currently paused.</Admonition> : null}
            {(details && details.paused_or_closed === "closed") ?
              <Admonition type="note">This migration has been closed recently.</Admonition> : null}
            {details && <Bar details={details} /> || null}
            {view === "graph" ?
              <Graph>{name}</Graph> :
              view === "impact" ?
                (details && <ImpactTable feedstockStatus={details._feedstock_status} details={details} />) :
                (details && <Table details={details} />)
            }
          </div>
        </div>
        <div className={`card margin-top--md`}>
          <div className="card__header">
            <h3>CI Status Legend</h3>
          </div>
          <div className="card__body">
            <CIStatusLegend />
          </div>
        </div>
      </main>
    </Layout>
  );
}

function Bar({ details }) {
  const prefix = "migration_details_filter_";
  return (
    <>
      <h4>PRs made {details.progress.percentage.toFixed(0)}%</h4>
      <div className={styles.migration_details_bar}>
        {ORDERED.filter(([key]) => details[key]?.length).map(([key], index) => (
          <>
            <a
              id={`migration-bar-element-${key}`}
              className={styles[`${prefix}${key.replace("-", "_")}`]}
              style={{ flex: details[key].length }}
              key={`migration-bar-element-href-${key}`}
              alt={
                TITLES[key]
                + " "
                + parseFloat(details[key].length*100/measureProgress(details).total).toFixed(1)
                + "% (" + details[key].length
                + " PRs over "
                + measureProgress(details).total
                + ")"
              }
            ></a>
            <Tooltip
              anchorSelect={`#migration-bar-element-${key}`}
              place="top"
              key={`migration-bar-element-tooltip-${key}`}
              className={styles.migration_details_bar_tooltip}
            >
              <div>{TITLES[key]}</div>
            </Tooltip>
          </>
        ))}
      </div>
    </>
  );
}

function Breadcrumbs({ children }) {
  return (
    <nav aria-label="breadcrumbs">
      <ul className="breadcrumbs">
        <li className="breadcrumbs__item">
          <a className="breadcrumbs__link" href="/">conda-forge</a>
        </li>
        <li className="breadcrumbs__item">
          <a className="breadcrumbs__link" href="/status">Status</a>
        </li>
        <li className="breadcrumbs__item">
          <a className="breadcrumbs__link" href="/status#migrations">
            Migrations
          </a>
        </li>
        <li className="breadcrumbs__item breadcrumbs__item--active">
          <a className="breadcrumbs__link" href="">{children}</a>
        </li>
      </ul>
    </nav>
  );
}

function Filters({ counts, filters, onFilter }) {
  return (
    <div className={styles.migration_details_filter}>
      {ORDERED.map(([key, title], index) => {
        const prefix = "migration_details_filter_";
        const base = `${prefix}${key.replace("-", "_")}`;
        return (
        <div
          className={[
            "button",
            styles.migration_details_filter_button,
            filters[key] ? "button--secondary" : "button--primary"
            ].join(" ")}
          key={index}
          onClick={() => onFilter(key)}>
          {filters[key] ?
            <span className={[
              styles[`${base}_hidden`],
              styles.migration_details_filter_dot,
              styles[`${base}_dot`],
            ].join(" ")}></span>
            :
            <span className={[
              styles[base],
              styles.migration_details_filter_dot,
              styles[`${base}_dot`],
            ].join(" ")}>
            </span>
          }
          <div className={styles.migration_details_filter_title_container}>
            {title} ({counts[key]})
          </div>
        </div>);
      })}
    </div>
  );
}

function Graph(props) {
  const [error, setState] = useState("");
  const url = urls.migrations.graph.replace("<NAME>", props.children);
  const onError = (error) => setState(error);
  return (
    <div>
      <p style={{textAlign: "center"}}>
        <a href={url} target="blank" rel="noopener noreferrer">
          <code>{props.children}.svg</code>
        </a>
      </p>
      {
        error ?
        <p style={{textAlign: "center"}}>
          Graph is unavailable.
        </p> :
        <div style={{ overflowX: "auto" }}>
          <SVG
            onError={onError}
            src={url}
            title={props.children}
            description={`Migration graph for ${props.children}`}
          />
        </div>
      }
    </div>
  );
}

function Table({ details }) {
  const defaultFilters = ORDERED.reduce((filters, [status, _, toggled]) => ({ ...filters, [status]: toggled }), {});
  const [filters, setFilters] = useState(defaultFilters);
  const [sortConfig, setSortConfig] = useState({ key: "num_descendants", direction: "desc" });
  const feedstock = details._feedstock_status;

  const getFilteredRows = () => {
    return ORDERED.reduce((rows, [status]) => (
      filters[status] ? rows :
        rows.concat((details[status]).map(name => ([name, status])))
    ), []);
  };

  const getSortedRows = (rowsToSort) => {
    const sorted = [...rowsToSort];
    sorted.sort((a, b) => {
      const [nameA, statusA] = a;
      const [nameB, statusB] = b;
      const feedstockA = feedstock[nameA];
      const feedstockB = feedstock[nameB];

      let compareValue = 0;

      switch (sortConfig.key) {
        case "name":
          compareValue = nameA.localeCompare(nameB);
          break;
        case "migration_status":
          compareValue = ORDERED.findIndex(x => x[0] == statusA) - ORDERED.findIndex(x => x[0] == statusB);
          break;
        case "ci_status":
          const statusOrder = { clean: 0, unknown: 1, unstable: 2, "": 3 };
          const statusValA = feedstockA["pr_status"] || "";
          const statusValB = feedstockB["pr_status"] || "";
          compareValue = (statusOrder[statusValA] || 3) - (statusOrder[statusValB] || 3);
          break;
        case "num_descendants":
          compareValue = feedstockA["num_descendants"] - feedstockB["num_descendants"];
          break;
        default:
          compareValue = 0;
      }

      return sortConfig.direction === "asc" ? compareValue : -compareValue;
    });
    return sorted;
  };

  const rows = getSortedRows(getFilteredRows());

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc"
    }));
  };

  const SortHeader = ({ column, label }) => (
    <th
      style={{ width: column === "num_descendants" ? 115 : (column === "name" ? 200 : 115), cursor: "pointer", userSelect: "none" }}
      onClick={() => handleSort(column)}
    >
      {label}
      <span style={{ marginLeft: "0.5em", opacity: sortConfig.key === column ? 1 : 0.4 }}>
        {sortConfig.key === column ? (sortConfig.direction === "desc" ? "▼" : "▲") : "⬍"}
      </span>
    </th>
  );

  return (
    <>
      <Filters
        counts={ORDERED.reduce((counts, [key]) =>
          ({ ...counts, [key]: 0 || details[key]?.length }), {})}
        filters={{ ...filters }}
        onFilter={key => setFilters(prev => ({ ...prev, [key]: !prev[key] }))} />
      {rows.length > 0 && <table>
        <thead>
          <tr>
            <SortHeader column="name" label="Name" />
            <SortHeader column="migration_status" label="Migration Status" />
            <SortHeader column="ci_status" label="CI Status" />
            <SortHeader column="num_descendants" label="Total number of children" />
            <th style={{ flex: 1 }}>Immediate children</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, status], i) =>
            <Row key={i}>{{ feedstock: feedstock[name], name, status }}</Row>
          )}
        </tbody>
      </table>}
    </>
  );
}

function Row({ children }) {
  const [collapsed, setState] = useState(true);
  const { feedstock, name, status } = children;
  const immediate_children = feedstock["immediate_children"] || [];
  const total_children = feedstock["num_descendants"];
  const href = feedstock["pr_url"];
  const details = feedstock["pre_pr_migrator_status"];
  const pr_status = feedstock["pr_status"];


  return (<>
    <tr>
      <td>
      {href ? (
        <a href={href}>{name}</a>
      ) : (
        details ? (
          <span className={`${collapsed ? styles.collapsed : styles.expanded}`}
            onClick={() => setState(!collapsed)}>
            {name}
          </span>) : (
          <span>{name}</span>)
      )}
      </td>
      <td style={{ textAlign: "center" }}>{TITLES[status]}</td>
      <td style={{ textAlign: "center" }}>
        {pr_status ? (
          <span
            className={`badge badge--${getStatusBadgeClass(pr_status)}`}
            title={CI_STATUS_DESCRIPTIONS[pr_status] || pr_status}
          >
            {pr_status}
          </span>
        ) : (
          <span>—</span>
        )}
      </td>
      <td style={{ textAlign: "center" }}>{total_children || null}</td>
      <td>
        {immediate_children.map((name, index) => (<React.Fragment key={index}>
          <span
            style={{ marginBottom: 1 }}
            className="badge badge--secondary">{name}</span>
          {immediate_children.length - 1 === index ? "" : " "}
        </React.Fragment>))}
      </td>
    </tr>
    {details && !collapsed && (<tr>
      <td colSpan={5}><pre dangerouslySetInnerHTML={{ __html: details}} /></td>
    </tr>)}
  </>);
}

function CIStatusLegend() {
  return (
    <div className={styles.ci_status_legend}>
      {Object.entries(CI_STATUS_DESCRIPTIONS).map(([status, description]) => (
        <div key={status} className={styles.ci_status_item}>
          <span className={`badge badge--${getStatusBadgeClass(status)}`}>{status}</span>
          <span>{description}</span>
        </div>
      ))}
      <a href="https://docs.github.com/en/graphql/reference/enums#mergestatestatus" target="_blank" rel="noopener noreferrer">See GitHub Docs</a>
    </div>
  );
}

async function checkPausedOrClosed(name) {
  for (const status of ["paused", "closed"]) {
    try {
      const response = await fetch(urls.migrations.status[status]);
      const data = await response.json();
      if (name in data) return status;
    } catch (error) {
      console.warn(`error checking status for ${name}:`, error);
    }
  }
}

function ImpactTable({ feedstockStatus, details }) {
  const [graph, setGraph] = useState(null);
  const svgRef = React.useRef();

  const getStatusColor = (prStatus) => {
    switch (prStatus) {
      case "clean":
        return "#28a745"; // Green
      case "unstable":
        return "#ffc107"; // Yellow
      case "unknown":
        return "#adb5bd"; // Lighter gray
      default:
        return "#e9ecef"; // Light gray for awaiting
    }
  };

  const getStatusTextColor = (prStatus) => {
    return prStatus === "clean" ? "#ffffff" : "#000000";
  };

  useEffect(() => {
    if (!feedstockStatus || Object.keys(feedstockStatus).length === 0) {
      console.log("No feedstock status data available");
      return;
    }

    // Get the set of merged packages (in "done" category)
    const mergedPackages = new Set(details?.done || []);

    // First pass: identify nodes that have direct children and aren't merged
    const nodesWithChildren = new Set();
    Object.entries(feedstockStatus).forEach(([name, data]) => {
      if (mergedPackages.has(name)) {
        return;
      }

      if (data.immediate_children && Array.isArray(data.immediate_children) && data.immediate_children.length > 0) {
        // Check if at least one child is not merged
        const hasNonMergedChild = data.immediate_children.some(child => !mergedPackages.has(child));
        if (hasNonMergedChild) {
          nodesWithChildren.add(name);
        }
      }
    });

    // === OPTIMIZE LAYOUT: FIND CONNECTED COMPONENTS ===
    // This helps minimize edge crossings by grouping related packages together
    const visited = new Set();
    const components = [];

    const dfs = (nodeId, component, visited) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      component.add(nodeId);

      const data = feedstockStatus[nodeId];
      if (data) {
        // Follow outgoing edges
        if (data.immediate_children && Array.isArray(data.immediate_children)) {
          data.immediate_children.forEach((child) => {
            if (feedstockStatus[child] && !mergedPackages.has(child)) {
              dfs(child, component, visited);
            }
          });
        }
      }

      // Follow incoming edges (look for parents)
      Object.entries(feedstockStatus).forEach(([potentialParent, parentData]) => {
        if (
          parentData.immediate_children &&
          parentData.immediate_children.includes(nodeId) &&
          !mergedPackages.has(potentialParent)
        ) {
          dfs(potentialParent, component, visited);
        }
      });
    };

    // Find all connected components
    nodesWithChildren.forEach((name) => {
      if (!visited.has(name)) {
        const component = new Set();
        dfs(name, component, visited);
        if (component.size > 0) {
          components.push(component);
        }
      }
    });

    console.log("Connected components:", components.map(c => Array.from(c)));

    // Create graph with compound structure (subgraphs for each component)
    const g = new dagreD3.graphlib.Graph({ compound: true, directed: true })
      .setGraph({
        nodesep: 50,
        ranksep: 100,
        rankdir: "TB",
      })
      .setDefaultEdgeLabel(() => ({}));

    // Add compound nodes (subgraphs) for each component
    components.forEach((component, componentIndex) => {
      const componentId = `component-${componentIndex}`;
      g.setNode(componentId, {
        label: "",
        clusterLabelPos: "top",
        style: "fill: none; stroke: #ccc; stroke-width: 1px; stroke-dasharray: 5,5;",
      });
    });

    // Add nodes to their components
    const nodeToComponent = {};
    components.forEach((component, componentIndex) => {
      component.forEach((nodeId) => {
        nodeToComponent[nodeId] = `component-${componentIndex}`;
      });
    });

    // Add nodes only if they have direct children
    nodesWithChildren.forEach((name) => {
      const data = feedstockStatus[name];
      const status = data.pr_status || "unknown";
      const label = `${name}\n(${data.num_descendants} deps)`;
      const componentId = nodeToComponent[name];

      g.setNode(name, {
        label: label,
        rx: 5,
        ry: 5,
        padding: 10,
        style: `fill: ${getStatusColor(status)}; stroke: #333; stroke-width: 1px;`,
        labelStyle: `fill: ${getStatusTextColor(status)}; font-size: 12px; font-weight: bold;`,
      });

      if (componentId) {
        g.setParent(name, componentId);
      }
    });

    // Add edges from each feedstock to its immediate children
    nodesWithChildren.forEach((name) => {
      const data = feedstockStatus[name];

      if (data.immediate_children && Array.isArray(data.immediate_children)) {
        data.immediate_children.forEach((child) => {
          if (feedstockStatus[child] && !mergedPackages.has(child)) {
            // Add child node if it doesn't exist yet
            if (!g.hasNode(child)) {
              const childData = feedstockStatus[child];
              const childStatus = childData.pr_status || "unknown";
              const childLabel = `${child}\n(${childData.num_descendants} deps)`;
              const componentId = nodeToComponent[child];

              g.setNode(child, {
                label: childLabel,
                rx: 5,
                ry: 5,
                padding: 10,
                style: `fill: ${getStatusColor(childStatus)}; stroke: #333; stroke-width: 1px;`,
                labelStyle: `fill: ${getStatusTextColor(childStatus)}; font-size: 12px; font-weight: bold;`,
              });

              if (componentId) {
                g.setParent(child, componentId);
              }
            }

            g.setEdge(name, child, {
              arrowheadStyle: "fill: #333;",
              style: "stroke: #333; stroke-width: 2px;",
            });
          }
        });
      }
    });

    setGraph(g);
  }, [feedstockStatus, details]);

  useEffect(() => {
    if (!graph || !svgRef.current) return;

    // === STATE FOR PERSISTENT HIGHLIGHTING AND ZOOMED VIEW ===
    let selectedNodeId = null;
    let isZoomedView = false;

    // === HELPER FUNCTION TO REBUILD GRAPH FROM BACKUP ===
    const rebuildOriginalGraph = () => {
      // Get the set of merged packages (in "done" category)
      const mergedPackages = new Set(details?.done || []);

      // === OPTIMIZE LAYOUT: FIND CONNECTED COMPONENTS ===
      const visited = new Set();
      const components = [];

      const dfs = (nodeId, component, visited) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        component.add(nodeId);

        const data = feedstockStatus[nodeId];
        if (data) {
          if (data.immediate_children && Array.isArray(data.immediate_children)) {
            data.immediate_children.forEach((child) => {
              if (feedstockStatus[child] && !mergedPackages.has(child)) {
                dfs(child, component, visited);
              }
            });
          }
        }

        Object.entries(feedstockStatus).forEach(([potentialParent, parentData]) => {
          if (
            parentData.immediate_children &&
            parentData.immediate_children.includes(nodeId) &&
            !mergedPackages.has(potentialParent)
          ) {
            dfs(potentialParent, component, visited);
          }
        });
      };

      // First pass: identify nodes that have direct children and aren't merged
      const nodesWithChildren = new Set();
      Object.entries(feedstockStatus).forEach(([name, data]) => {
        if (mergedPackages.has(name)) {
          return;
        }

        if (data.immediate_children && Array.isArray(data.immediate_children) && data.immediate_children.length > 0) {
          const hasNonMergedChild = data.immediate_children.some(child => !mergedPackages.has(child));
          if (hasNonMergedChild) {
            nodesWithChildren.add(name);
          }
        }
      });

      nodesWithChildren.forEach((name) => {
        if (!visited.has(name)) {
          const component = new Set();
          dfs(name, component, visited);
          if (component.size > 0) {
            components.push(component);
          }
        }
      });

      // Create graph with compound structure
      const g = new dagreD3.graphlib.Graph({ compound: true, directed: true })
        .setGraph({
          nodesep: 50,
          ranksep: 100,
          rankdir: "TB",
        })
        .setDefaultEdgeLabel(() => ({}));

      // Add compound nodes (subgraphs) for each component
      components.forEach((component, componentIndex) => {
        const componentId = `component-${componentIndex}`;
        g.setNode(componentId, {
          label: "",
          clusterLabelPos: "top",
          style: "fill: none; stroke: #ccc; stroke-width: 1px; stroke-dasharray: 5,5;",
        });
      });

      // Add nodes to their components
      const nodeToComponent = {};
      components.forEach((component, componentIndex) => {
        component.forEach((nodeId) => {
          nodeToComponent[nodeId] = `component-${componentIndex}`;
        });
      });

      // Add nodes only if they have direct children
      nodesWithChildren.forEach((name) => {
        const data = feedstockStatus[name];
        const status = data.pr_status || "unknown";
        const label = name;
        const componentId = nodeToComponent[name];

        g.setNode(name, {
          label: label,
          rx: 5,
          ry: 5,
          padding: 10,
          style: `fill: ${getStatusColor(status)}; stroke: #333; stroke-width: 1px;`,
          labelStyle: `fill: ${getStatusTextColor(status)}; font-size: 12px; font-weight: bold;`,
        });

        if (componentId) {
          g.setParent(name, componentId);
        }
      });

      // Add edges from each feedstock to its immediate children
      nodesWithChildren.forEach((name) => {
        const data = feedstockStatus[name];

        if (data.immediate_children && Array.isArray(data.immediate_children)) {
          data.immediate_children.forEach((child) => {
            if (feedstockStatus[child] && !mergedPackages.has(child)) {
              if (!g.hasNode(child)) {
                const childData = feedstockStatus[child];
                const childStatus = childData.pr_status || "unknown";
                const childLabel = child;
                const componentId = nodeToComponent[child];

                g.setNode(child, {
                  label: childLabel,
                  rx: 5,
                  ry: 5,
                  padding: 10,
                  style: `fill: ${getStatusColor(childStatus)}; stroke: #333; stroke-width: 1px;`,
                  labelStyle: `fill: ${getStatusTextColor(childStatus)}; font-size: 12px; font-weight: bold;`,
                });

                if (componentId) {
                  g.setParent(child, componentId);
                }
              }

              g.setEdge(name, child, {
                arrowheadStyle: "fill: #333;",
                style: "stroke: #333; stroke-width: 2px;",
              });
            }
          });
        }
      });

      return g;
    };

    // === BUILD DATA STRUCTURE ===
    // Create a lookup structure: nodeId -> { outgoing: [edgeIds], incoming: [edgeIds] }
    const nodeMap = {};
    graph.nodes().forEach(nodeId => {
      nodeMap[nodeId] = {
        outgoing: [],
        incoming: []
      };
    });

    // Map edges: edgeId -> { source, target }
    const edgeMap = {};
    graph.edges().forEach(edge => {
      const edgeId = `${edge.v}→${edge.w}`;
      edgeMap[edgeId] = {
        source: edge.v,
        target: edge.w
      };
      nodeMap[edge.v].outgoing.push(edgeId);
      nodeMap[edge.w].incoming.push(edgeId);
    });

    console.log("Node map:", nodeMap);
    console.log("Edge map:", edgeMap);

    // === HELPER FUNCTION TO FIND ALL ANCESTORS ===
    const findAllAncestors = (nodeId) => {
      const ancestors = new Set();
      const queue = [nodeId];
      const visited = new Set([nodeId]);

      while (queue.length > 0) {
        const current = queue.shift();
        const incomingEdges = nodeMap[current]?.incoming || [];

        incomingEdges.forEach(eid => {
          const parentId = edgeMap[eid].source;
          if (!visited.has(parentId)) {
            visited.add(parentId);
            ancestors.add(parentId);
            queue.push(parentId);
          }
        });
      }

      return ancestors;
    };

    // === HELPER FUNCTION TO FIND ALL DESCENDANTS ===
    const findAllDescendants = (nodeId) => {
      const descendants = new Set();
      const queue = [nodeId];
      const visited = new Set([nodeId]);

      while (queue.length > 0) {
        const current = queue.shift();
        const outgoingEdges = nodeMap[current]?.outgoing || [];

        outgoingEdges.forEach(eid => {
          const childId = edgeMap[eid].target;
          if (!visited.has(childId)) {
            visited.add(childId);
            descendants.add(childId);
            queue.push(childId);
          }
        });
      }

      return descendants;
    };

    // === HELPER FUNCTION TO APPLY HIGHLIGHTING ===
    const applyHighlight = (nodeId) => {
      if (!nodeId) {
        // Clear all highlights
        svgGroup.selectAll("g.node").style("opacity", 1);
        svgGroup.selectAll("g.edgePath").style("opacity", 1);
        svgGroup.selectAll("g.edgePath path")
          .style("stroke", "#333")
          .style("stroke-width", "2px");
        return;
      }

      // Get related nodes and edges from our data structure
      const outgoingEdgeIds = nodeMap[nodeId]?.outgoing || [];
      const incomingEdgeIds = nodeMap[nodeId]?.incoming || [];
      const allRelatedEdgeIds = [...outgoingEdgeIds, ...incomingEdgeIds];

      const childNodeIds = outgoingEdgeIds.map(eid => edgeMap[eid].target);
      const parentNodeIds = incomingEdgeIds.map(eid => edgeMap[eid].source);
      const highlightNodeIds = new Set([nodeId, ...childNodeIds, ...parentNodeIds]);

      // Dim all nodes
      svgGroup.selectAll("g.node").style("opacity", function () {
        const nid = d3.select(this).attr("data-node-id");
        return highlightNodeIds.has(nid) ? 1 : 0.2;
      });

      // Dim all edges
      svgGroup.selectAll("g.edgePath").style("opacity", 0.05);

      // Highlight related edges (both incoming and outgoing)
      svgGroup.selectAll("g.edgePath").each(function () {
        const eid = d3.select(this).attr("data-edge-id");
        if (allRelatedEdgeIds.includes(eid)) {
          // Move to front
          this.parentNode.appendChild(this);

          d3.select(this)
            .style("opacity", 1)
            .selectAll("path")
            .style("stroke", "#FF6B35")
            .style("stroke-width", "4px");
        }
      });
    };

    // === HELPER FUNCTION TO CREATE ZOOMED SUBGRAPH ===
    const createZoomedGraph = (nodeId) => {
      // Find all ancestors and descendants
      const ancestors = findAllAncestors(nodeId);
      const descendants = findAllDescendants(nodeId);
      const visibleNodes = new Set([nodeId, ...ancestors, ...descendants]);

      console.log("Zoomed view for:", nodeId);
      console.log("Ancestors:", Array.from(ancestors));
      console.log("Descendants:", Array.from(descendants));
      console.log("Total visible nodes:", visibleNodes.size);

      // Create new subgraph with only visible nodes
      const subgraph = new dagreD3.graphlib.Graph({ compound: true, directed: true })
        .setGraph({
          nodesep: 50,
          ranksep: 100,
          rankdir: "TB",
        })
        .setDefaultEdgeLabel(() => ({}));

      // Add all visible nodes to the subgraph
      visibleNodes.forEach(nodeName => {
        const data = feedstockStatus[nodeName];
        if (data) {
          const status = data.pr_status || "unknown";
          const label = nodeName;

          subgraph.setNode(nodeName, {
            label: label,
            rx: 5,
            ry: 5,
            padding: 10,
            style: `fill: ${getStatusColor(status)}; stroke: #333; stroke-width: 1px;`,
            labelStyle: `fill: ${getStatusTextColor(status)}; font-size: 12px; font-weight: bold;`,
          });
        }
      });

      // Add edges between visible nodes
      Object.entries(edgeMap).forEach(([edgeId, edge]) => {
        if (visibleNodes.has(edge.source) && visibleNodes.has(edge.target)) {
          subgraph.setEdge(edge.source, edge.target, {
            arrowheadStyle: "fill: #333;",
            style: "stroke: #333; stroke-width: 2px;",
          });
        }
      });

      return subgraph;
    };

    // Clear previous content
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Create SVG group and set up zoom
    const svgGroup = svg.append("g");

    // Create the renderer
    const render = new dagreD3.render();

    // Run the renderer
    render(svgGroup, graph);

    // === ASSOCIATE SVG ELEMENTS WITH DATA ===
    // Add data attributes to SVG elements so we can find them later
    svgGroup.selectAll("g.node").each(function () {
      const fullText = d3.select(this).select("text").text().split("\n")[0];
      const nodeId = fullText.split("(")[0].trim();
      d3.select(this).attr("data-node-id", nodeId);
    });

    // Add data attributes to edge elements
    let edgeIndex = 0;
    const edgeIdMap = {}; // Map SVG element index to edge id
    svgGroup.selectAll("g.edgePath").each(function () {
      // Try to match by looking at visual position or order
      const edgeIds = Object.keys(edgeMap);
      if (edgeIndex < edgeIds.length) {
        const edgeId = edgeIds[edgeIndex];
        d3.select(this).attr("data-edge-id", edgeId);
        edgeIdMap[edgeIndex] = edgeId;
      }
      edgeIndex++;
    });

    // === HOVER AND CLICK HANDLERS ===
    svgGroup.selectAll("g.node").style("cursor", "pointer");

    svgGroup.selectAll("g.node").on("mouseenter", function () {
      // Only apply hover highlight if no node is selected
      if (!selectedNodeId) {
        const nodeId = d3.select(this).attr("data-node-id");
        applyHighlight(nodeId);
      }
    });

    svgGroup.selectAll("g.node").on("mouseleave", function () {
      // Only reset if no node is selected
      if (!selectedNodeId) {
        applyHighlight(null);
      }
    });

    svgGroup.selectAll("g.node").on("click", function () {
      const nodeId = d3.select(this).attr("data-node-id");

      // Toggle selection
      if (selectedNodeId === nodeId && isZoomedView) {
        // If clicking the same node while zoomed, go back to full view
        selectedNodeId = null;
        isZoomedView = false;
        setGraph(rebuildOriginalGraph());
        return;
      }

      if (selectedNodeId === nodeId && !isZoomedView) {
        // If clicking the same node in normal view, zoom in
        selectedNodeId = nodeId;
        isZoomedView = true;
        const zoomedGraph = createZoomedGraph(nodeId);
        setGraph(zoomedGraph);
      } else {
        // New selection
        selectedNodeId = nodeId;
        isZoomedView = true;
        const zoomedGraph = createZoomedGraph(nodeId);
        setGraph(zoomedGraph);
      }

      console.log("Selected node:", selectedNodeId, "Zoomed:", isZoomedView);
    });

    // Click on background (void) to reset view
    svg.on("click", function (event) {
      // Check if click was on the background (SVG element itself), not on a child node
      if (event.target === this) {
        selectedNodeId = null;
        isZoomedView = false;
        setGraph(rebuildOriginalGraph());
        applyHighlight(null);
        console.log("Reset view");
      }
    });

    // Setup zoom behavior
    const zoom = d3.zoom().on("zoom", (event) => {
      svgGroup.attr("transform", event.transform);
    });

    svg.call(zoom);

    // Center the graph initially
    const graphWidth = graph.graph().width;
    const graphHeight = graph.graph().height;
    const svgWidth = svgRef.current.clientWidth;
    const svgHeight = svgRef.current.clientHeight;

    const initialScale = Math.min(
      svgWidth / graphWidth,
      svgHeight / graphHeight,
      1
    ) * 0.85;

    const initialTranslate = [
      (svgWidth - graphWidth * initialScale) / 2,
      (svgHeight - graphHeight * initialScale) / 2,
    ];

    svg.call(
      zoom.transform,
      d3.zoomIdentity
        .translate(initialTranslate[0], initialTranslate[1])
        .scale(initialScale)
    );
  }, [graph]);

  return (
    <div className={styles.impactTableContainer}>
      <div className={styles.graphHeader}>
        <h3>Feedstock Impact Graph</h3>
        <span className={styles.instructions}>Click on node to zoom, click on background to reset view</span>
      </div>
      <div className={styles.graphContainer}>
        <svg ref={svgRef}></svg>
      </div>
      <div className={styles.graphInfo}>
        <p>
          Node labels show package name and number of downstream dependencies.
          Arrows point from package to its immediate children (dependents).
          Use mouse wheel to zoom and drag to pan.
        </p>
      </div>
    </div>
  );
}
