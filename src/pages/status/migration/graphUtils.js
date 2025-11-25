/**
 * Utility functions for graph operations in the migration status page
 */

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

export const getAwaitingParentsWithNoParent = (feedstockStatus, details) => {
  const noParents = new Set();
  const allChildren = new Set();

  // Build set of all children in the graph
  Object.entries(feedstockStatus).forEach(([name, data]) => {
    if (data.immediate_children && Array.isArray(data.immediate_children)) {
      data.immediate_children.forEach(child => {
        allChildren.add(child);
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

export const findConnectedComponents = (feedstockStatus, nodesWithChildren, mergedPackages) => {
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
