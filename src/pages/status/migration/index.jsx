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
