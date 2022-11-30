// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    { type: "doc", id: "intro", label: "Introduction" },
    {
      type: "category",
      label: "API",
      items: [
        { type: "doc", id: "api/class_api", label: "Class API" },
        { type: "doc", id: "api/LazySeq", label: "LazySeq" },
        { type: "doc", id: "api/HashMap", label: "HashMap" },
        { type: "doc", id: "api/HashSet", label: "HashSet" },
        { type: "doc", id: "api/OrderedMap", label: "OrderedMap" },
        { type: "doc", id: "api/OrderedSet", label: "OrderedSet" },
        { type: "doc", id: "api/data_structures_hamt", label: "Function HAMT" },
        { type: "doc", id: "api/data_structures_tree", label: "Function Tree" },
      ],
    },
  ],
};

// eslint-disable-next-line no-undef
module.exports = sidebars;
