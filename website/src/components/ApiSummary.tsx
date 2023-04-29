import React from "react";

export default function ApiSummary({
  children,
}: {
  children?: JSX.Element;
}): JSX.Element {
  return <div className="seedtactics-api-summary">{children}</div>;
}
