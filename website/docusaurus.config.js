/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require("prism-react-renderer/themes/github");
const darkCodeTheme = require("prism-react-renderer/themes/dracula");

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Immutable Collections for Typescript",
  tagline: "Dinosaurs are cool",
  url: "https://seedtactics.github.io",
  baseUrl: "/immutable-collections/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/favicon.ico",

  // GitHub pages deployment config.
  organizationName: "SeedTactics",
  projectName: "immutable-collections",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: "immutable-collections",
        logo: {
          alt: "My Site Logo",
          src: "img/logo.svg",
        },
        items: [
          {
            type: "doc",
            docId: "intro",
            position: "left",
            label: "Introduction",
          },
          {
            type: "doc",
            docId: "api/class_api",
            position: "left",
            label: "API",
          },
          {
            href: "https://github.com/SeedTactics/immutable-collections",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Guide",
            items: [
              {
                label: "Introduction",
                to: "/docs/intro",
              },
            ],
          },
          {
            title: "API",
            items: [
              {
                label: "Class API",
                to: "/docs/api/class_api",
              },
              {
                label: "HashMap",
                to: "/docs/api/HashMap",
              },
              {
                label: "OrderedMap",
                to: "/docs/api/OrderedMap",
              },
              {
                label: "LazySeq",
                to: "/docs/api/LazySeq",
              },
            ],
          },
          {
            title: "Links",
            items: [
              {
                label: "GitHub",
                href: "https://github.com/SeedTactics/immutable-collections",
              },
              {
                label: "NPM",
                href: "https://www.npmjs.com/package/@seedtactics/immutable-collections",
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Black Maple Software, LLC. Built with Docusaurus.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
module.exports = config;
