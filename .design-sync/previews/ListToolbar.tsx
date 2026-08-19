import { ListToolbar } from "skolregistret-ui";

export const Default = () => (
  <ListToolbar count="412 skolenheter" scope="i Uppsala kommun" />
);

export const NoScope = () => <ListToolbar count="4 821 skolenheter" />;
