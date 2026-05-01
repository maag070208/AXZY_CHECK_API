export interface ITDataTableFetchParams {
  page: number; // Current page, starts at 1
  limit: number; // Items per page
  filters: Record<string, string | number | boolean>; // e.g., { username: "pepe" }
  sort?: {
    key: string; 
    direction: "asc" | "desc";
  };
}

export interface ITDataTableResponse<T> {
  rows: T[]; // The paginated array
  total: number; // Global count without limit for visual pagination
}
