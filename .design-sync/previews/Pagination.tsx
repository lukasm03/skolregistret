import { useState } from "react";
import { Pagination } from "skolregistret-ui";

export const MidRange = () => {
  const [page, setPage] = useState(5);
  return <Pagination page={page} totalPages={22} onGoTo={setPage} />;
};

export const FirstPage = () => {
  const [page, setPage] = useState(1);
  return <Pagination page={page} totalPages={22} onGoTo={setPage} />;
};
