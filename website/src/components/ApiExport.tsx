import React from "react";

interface ExportProps {
  readonly kind: string;
  readonly source?: string;
  readonly anchor?: string;
  readonly static?: boolean;
  readonly children?: React.ReactNode;
}

export default function Export(props: ExportProps): JSX.Element {
  return (
    <div id={props.anchor}>
      <div>Kind: {props.kind}</div>
      <div>Source: {props.source}</div>
      <div>Static: {props.static}</div>
      {props.children}
    </div>
  );
}
