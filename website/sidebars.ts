import { SidebarsConfig } from "@docusaurus/plugin-content-docs";
const sidebars: SidebarsConfig = {
  docsSidebar: [
    { type: "doc", id: "intro", label: "Introduction" },
    {
      type: "category",
      label: "Guide",
      items: [
        { type: "doc", id: "data-structure-compare", label: "Data Structure Comparison" },
        { type: "doc", id: "data-manipulation", label: "Data Manipulation" },
        { type: "doc", id: "bulk-operations", label: "Bulk Operations" },
        { type: "doc", id: "shallow-comparison", label: "Shallow Comparison" },
        { type: "doc", id: "bundle-size", label: "Bundle Size" },
      ],
    },
  ],
};

export default sidebars;
