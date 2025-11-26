/**
 * Utility functions for graph operations in the migration status page
 */

import * as dagreD3 from "dagre-d3-es";
import * as d3 from "d3";

// Constants for graph styling
const DEFAULT_GRAPH_SETTINGS = {
  nodesep: 50,
  ranksep: 100,
  rankdir: "TB",
};

const EDGE_STYLE = {
  arrowheadStyle: "fill: #333;",
  style: "stroke: #333; stroke-width: 2px;",
};

// Helper function to create node styling
const createNodeStyle = (nodeName, status) => ({
  label: nodeName,
  rx: 5,
  ry: 5,
  padding: 10,
  style: `fill: ${getStatusColor(status)}; stroke: #333; stroke-width: 1px;`,
  labelStyle: `fill: ${getStatusTextColor(status)}; font-size: 12px; font-weight: bold;`,
});

// Helper function to extract node ID from SVG element
export const getNodeIdFromSvgElement = (element) => {
  const fullText = d3.select(element).select("text").text().split("\n")[0];
  return fullText.split("(")[0].trim();
};

export const getPrunedFeedstockStatus = (feedstockStatus, details) => {
  if (!feedstockStatus || !details?.done) return feedstockStatus;

  const mergedPackages = new Set(details.done);
  const pruned = {};

  Object.entries(feedstockStatus).forEach(([name, data]) => {
    if (!mergedPackages.has(name)) {
      pruned[name] = data;
    }
  });

  return pruned;
};

export const getStatusColor = (prStatus) => {
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

export const getStatusTextColor = (prStatus) => {
  return prStatus === "clean" ? "#ffffff" : "#000000";
};

export const filterNodesBySearchTerm = (nodeNames, searchTerm) => {
  if (!searchTerm) return [];
  return nodeNames.filter(name =>
    name.toLowerCase().includes(searchTerm.toLowerCase())
  );
};

export const getAwaitingParentsWithNoParent = (nodeMap, details) => {
  const noParents = new Set();
  const allChildren = new Set();

  // Build set of all children in the graph using nodeMap
  Object.entries(nodeMap).forEach(([nodeId, nodeInfo]) => {
    if (nodeInfo.outgoing && nodeInfo.outgoing.length > 0) {
      // Node has outgoing edges, collect all targets
      nodeInfo.outgoing.forEach(edgeId => {
        // Extract target from edgeId (format: "source->target")
        const target = edgeId.split('->')[1];
        if (target) {
          allChildren.add(target);
        }
      });
    }
  });

  // Find packages in awaiting-parents that are not children of any node
  const awaitingParents = details?.["awaiting-parents"] || [];
  awaitingParents.forEach(name => {
    if (!allChildren.has(name)) {
      noParents.add(name);
    }
  });

  return noParents;
};

export const findRelatedNodes = (nodeId, graphDataStructure) => {
  const { nodeMap, edgeMap } = graphDataStructure;
  const queue = [nodeId];
  const visited = new Set([nodeId]);

  while (queue.length > 0) {
    const current = queue.shift();
    const nodeInfo = nodeMap[current];
    if (!nodeInfo) continue;

    // Process incoming edges (ancestors)
    const incomingEdges = nodeInfo.incoming || [];
    incomingEdges.forEach(eid => {
      const parentId = edgeMap[eid].source;
      if (!visited.has(parentId)) {
        visited.add(parentId);
        queue.push(parentId);
      }
    });

    // Process outgoing edges (descendants)
    const outgoingEdges = nodeInfo.outgoing || [];
    outgoingEdges.forEach(eid => {
      const childId = edgeMap[eid].target;
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push(childId);
      }
    });
  }

  return visited;
};

export const findConnectedComponents = (nodeMap, edgeMap, nodesWithChildren) => {
  const visited = new Set();
  const components = [];

  const dfs = (nodeId, component, visited) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    component.add(nodeId);

    const nodeInfo = nodeMap[nodeId];
    if (nodeInfo) {
      // Follow outgoing edges (children)
      if (nodeInfo.outgoing && nodeInfo.outgoing.length > 0) {
        nodeInfo.outgoing.forEach((edgeId) => {
          const childId = edgeMap[edgeId].target;
          dfs(childId, component, visited);
        });
      }

      // Follow incoming edges (parents)
      if (nodeInfo.incoming && nodeInfo.incoming.length > 0) {
        nodeInfo.incoming.forEach((edgeId) => {
          const parentId = edgeMap[edgeId].source;
          dfs(parentId, component, visited);
        });
      }
    }
  };

  nodesWithChildren.forEach((name) => {
    if (!visited.has(name)) {
      const component = new Set();
      dfs(name, component, visited);
      if (component.size > 0) {
        components.push(component);
      }
    }
  });

  return components;
};

export const buildGraphDataStructure = (feedstockStatus) => {
  if (!feedstockStatus || Object.keys(feedstockStatus).length === 0) {
    return { nodeMap: {}, edgeMap: {}, allNodeIds: [] };
  }

  const nodeMap = {};
  const edgeMap = {};

  // Initialize all nodes
  Object.keys(feedstockStatus).forEach(nodeId => {
    nodeMap[nodeId] = {
      data: feedstockStatus[nodeId],
      incoming: [],
      outgoing: []
    };
  });

  // Build edges from immediate_children
  Object.entries(feedstockStatus).forEach(([nodeId, data]) => {
    if (data.immediate_children && Array.isArray(data.immediate_children)) {
      data.immediate_children.forEach((childId) => {
        if (feedstockStatus[childId]) {
          const edgeId = `${nodeId}->${childId}`;
          edgeMap[edgeId] = {
            source: nodeId,
            target: childId
          };
          nodeMap[nodeId].outgoing.push(edgeId);
          nodeMap[childId].incoming.push(edgeId);
        }
      });
    }
  });

  return {
    nodeMap,
    edgeMap,
    allNodeIds: Object.keys(nodeMap)
  };
};

export const buildInitialGraph = (graphDataStructure) => {
  const { nodeMap, edgeMap, allNodeIds } = graphDataStructure;

  if (!allNodeIds || allNodeIds.length === 0) {
    return null;
  }

  // Identify nodes that have direct children using nodeMap
  const nodesWithChildren = new Set();
  allNodeIds.forEach(nodeId => {
    if (nodeMap[nodeId].outgoing && nodeMap[nodeId].outgoing.length > 0) {
      nodesWithChildren.add(nodeId);
    }
  });

  // Find connected components using the data structure
  const components = findConnectedComponents(nodeMap, edgeMap, nodesWithChildren);

  // Build and return the graph using the data structure
  return buildGraph(nodeMap, edgeMap, components, nodesWithChildren);
};

export const applyHighlight = (svgGroup, nodeId, graphDataStructure) => {
  const { nodeMap, edgeMap } = graphDataStructure;

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
  const allRelatedEdgeIds = new Set([...outgoingEdgeIds, ...incomingEdgeIds]);

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
    if (allRelatedEdgeIds.has(eid)) {
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

export const createZoomedGraph = (nodeIdToZoom, graphDataStructure) => {
  const { nodeMap, edgeMap } = graphDataStructure;

  // Find all related nodes (self, ancestors, and descendants)
  const visibleNodes = findRelatedNodes(nodeIdToZoom, graphDataStructure);

  // Create new subgraph with only visible nodes
  const subgraph = new dagreD3.graphlib.Graph({ compound: true, directed: true })
    .setGraph(DEFAULT_GRAPH_SETTINGS)
    .setDefaultEdgeLabel(() => ({}));

  // Add all visible nodes to the subgraph
  visibleNodes.forEach(nodeName => {
    const nodeInfo = nodeMap[nodeName];
    if (nodeInfo) {
      const status = nodeInfo.data.pr_status || "unknown";
      subgraph.setNode(nodeName, createNodeStyle(nodeName, status));
    }
  });

  // Add edges between visible nodes
  Object.entries(edgeMap).forEach(([edgeId, edge]) => {
    if (visibleNodes.has(edge.source) && visibleNodes.has(edge.target)) {
      subgraph.setEdge(edge.source, edge.target, EDGE_STYLE);
    }
  });

  return subgraph;
};

export const buildGraph = (nodeMap, edgeMap, components, nodesWithChildren) => {
  const g = new dagreD3.graphlib.Graph({ compound: true, directed: true })
    .setGraph(DEFAULT_GRAPH_SETTINGS)
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
    const nodeInfo = nodeMap[name];
    if (!nodeInfo) return;

    const data = nodeInfo.data;
    const status = data.pr_status || "unknown";
    const componentId = nodeToComponent[name];

    g.setNode(name, createNodeStyle(name, status));

    if (componentId) {
      g.setParent(name, componentId);
    }
  });

  // Add edges and child nodes using the edgeMap
  const addedNodes = new Set(nodesWithChildren);

  nodesWithChildren.forEach((name) => {
    const nodeInfo = nodeMap[name];
    if (!nodeInfo) return;

    // Process all outgoing edges from this node
    nodeInfo.outgoing.forEach((edgeId) => {
      const childId = edgeMap[edgeId].target;
      const childNodeInfo = nodeMap[childId];

      if (childNodeInfo && !addedNodes.has(childId)) {
        // Add the child node if not already added
        const childData = childNodeInfo.data;
        const childStatus = childData.pr_status || "unknown";
        const componentId = nodeToComponent[childId];

        g.setNode(childId, createNodeStyle(childId, childStatus));

        if (componentId) {
          g.setParent(childId, componentId);
        }

        addedNodes.add(childId);
      }

      // Add edge
      g.setEdge(name, childId, EDGE_STYLE);
    });
  });

  return g;
};
