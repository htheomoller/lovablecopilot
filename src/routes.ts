/* If your app has a central router config, add this route entry.
If you use file-based routing, ignore this file and create the page at /tools/ping-edge instead. */
export const routes = [
  // …other routes
  { path: "/tools/ping-edge", element: () => import("@/pages/tools/PingEdge") },
];