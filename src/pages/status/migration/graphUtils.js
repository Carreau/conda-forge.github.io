/**
 * Utility functions for graph operations in the migration status page
 */

import * as dagreD3 from "dagre-d3-es";

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

export const getNodeNamesWithChildren = (feedstockStatus) => {
  if (!feedstockStatus) return [];
  return Object.keys(feedstockStatus)
    .filter(name => {
      const data = feedstockStatus[name];
      return data.immediate_children && Array.isArray(data.immediate_children) && data.immediate_children.length > 0;
    })
    .sort();
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

export const getNodesWithChildren = (feedstockStatus, mergedPackages) => {
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

  return nodesWithChildren;
};

export const findAllAncestors = (nodeId, nodeMap, edgeMap) => {
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

export const findAllDescendants = (nodeId, nodeMap, edgeMap) => {
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

export const findConnectedComponents = (feedstockStatus, nodesWithChildren) => {
  const visited = new Set();
  const components = [];

  const dfs = (nodeId, component, visited) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    component.add(nodeId);

    const data = feedstockStatus[nodeId];
    if (data && data.immediate_children && Array.isArray(data.immediate_children)) {
      data.immediate_children.forEach((child) => {
        if (feedstockStatus[child]) {
          dfs(child, component, visited);
        }
      });
    }

    Object.entries(feedstockStatus).forEach(([potentialParent, parentData]) => {
      if (parentData.immediate_children && parentData.immediate_children.includes(nodeId)) {
        dfs(potentialParent, component, visited);
      }
    });
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

export const buildInitialGraph = (nodeMap, allNodeIds) => {
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

  // Reconstruct feedstock for findConnectedComponents (it still needs it)
  const feedstockStatus = {};
  allNodeIds.forEach(nodeId => {
    feedstockStatus[nodeId] = nodeMap[nodeId].data;
  });

  // Find connected components
  const components = findConnectedComponents(feedstockStatus, nodesWithChildren);

  // Build and return the graph
  return buildGraph(feedstockStatus, components, nodesWithChildren);
};

export const buildGraph = (prunedFeedstockStatus, components, nodesWithChildren) => {
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
    const data = prunedFeedstockStatus[name];
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
    const data = prunedFeedstockStatus[name];

    if (data.immediate_children && Array.isArray(data.immediate_children)) {
      data.immediate_children.forEach((child) => {
        if (prunedFeedstockStatus[child]) {
          if (!g.hasNode(child)) {
            const childData = prunedFeedstockStatus[child];
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
