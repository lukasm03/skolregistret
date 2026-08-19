import { ListFooter, Pagination, PerPageControl } from "skolregistret-ui";

export const Default = () => (
  <ListFooter>
    <Pagination page={3} totalPages={12} onGoTo={() => {}} />
    <PerPageControl perPage={50} onChange={() => {}} />
  </ListFooter>
);
