import React from "react";

export default function ApiRemarks({
  children,
}: {
  children?: JSX.Element;
}): JSX.Element {
  return <div className="seedtactics-api-remarks">{children}</div>;
}
