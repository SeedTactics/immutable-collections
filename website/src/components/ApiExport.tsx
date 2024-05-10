import useBrokenLinks from "@docusaurus/useBrokenLinks";
import React from "react";

interface ExportProps {
  readonly src?: string;
  readonly anchor?: string;
  readonly children?: React.ReactNode;
}

export default function ApiExport(props: ExportProps): JSX.Element {
  useBrokenLinks().collectAnchor(props.anchor);
  return (
    <div id={props.anchor} className="seedtactics-api-export">
      <div className="seedtactics-signature">{props.children}</div>
      <a href={"#" + props.anchor}>#</a>
      {props.src ? <a href={props.src}>Source</a> : undefined}
    </div>
  );
}
