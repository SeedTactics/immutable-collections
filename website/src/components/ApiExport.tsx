import React from "react";

interface ExportProps {
  readonly src?: string;
  readonly anchor?: string;
  readonly children?: React.ReactNode;
}

export default function Export(props: ExportProps): JSX.Element {
  return (
    <>
      <div id={props.anchor} className="seedtactics-api-export">
        <div className="seedtactics-signature">{props.children}</div>
        <a href={"#" + props.anchor}>#</a>
        {props.src ? <a href={props.src}>Source</a> : undefined}
      </div>
    </>
  );
}
