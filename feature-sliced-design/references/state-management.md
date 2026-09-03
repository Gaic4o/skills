# State Management

Concrete code patterns for Redux and TanStack Query (React Query) within
FSD structure. Authentication, type, and API request patterns are in
`references/auth-and-api.md`. Code samples are React; the placement
rules are framework-agnostic.

## State Management: Redux

### Where a Redux slice belongs

The `from-custom` migration guide draws a clean line: **business
entities** (the things your app works with, like `todo`, `product`, `user`)
go in the Entities layer; **user actions** (`add-todo`, `toggle-todo`,
`like-post`) go in Features.

In v2.1, also remember the pages-first rule: if the slice is used by a
single page, keep it in that page's `model/` segment until reuse appears.

### Business-entity slice in entities

```typescript
// entities/todo/model/todo.ts
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { apiClient } from "@/shared/api";

interface Todo { id: string; title: string; completed: boolean }
interface TodoState { items: Todo[]; loading: boolean }

export const fetchTodos = createAsyncThunk("todos/fetch", async () =>
  (await apiClient.get<Todo[]>("/todos")).data,
);

const todoSlice = createSlice({
  name: "todos",
  initialState: { items: [], loading: false } as TodoState,
  reducers: {
    setCompleted: (state, { payload }: { payload: { id: string; completed: boolean } }) => {
      const todo = state.items.find((t) => t.id === payload.id);
      if (todo) todo.completed = payload.completed;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTodos.pending, (state) => { state.loading = true; })
      .addCase(fetchTodos.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
      });
  },
});

export const { setCompleted } = todoSlice.actions;
export const selectTodos = (state: { todos: TodoState }) => state.todos.items;
export const todoReducer = todoSlice.reducer;
```

The selector takes only the state it reads, not `RootState`. `RootState` is
declared in `app/`, so an entity importing it would depend on a higher layer
(Rule 4-1). The trade-off is that the selector no longer type-checks against
the whole store. Type it at the `app/` layer when you need that guarantee.

The slice's public API re-exports what consumers need:

```typescript
// entities/todo/index.ts
export { todoReducer, selectTodos, setCompleted, fetchTodos } from "./model/todo";
```

**Key:** The entire Redux slice (reducer + selectors + thunks) lives in a
single domain-named file, not split across `reducers.ts`, `selectors.ts`,
`thunks.ts`. That technical-role split reduces cohesion and is an
anti-pattern in FSD.

### User-action slice in features

A user action that orchestrates the entity exposes a hook through its
public API and consumes the entity's reducer:

```typescript
// features/toggle-todo/model/use-toggle-todo.ts
import { useDispatch } from "react-redux";
import { setCompleted } from "@/entities/todo";

export const useToggleTodo = () => {
  const dispatch = useDispatch();
  return (id: string, current: boolean) =>
    dispatch(setCompleted({ id, completed: !current }));
};
```

### Registering slices in app

```typescript
// app/providers/store.ts
import { configureStore } from "@reduxjs/toolkit";
import { todoReducer } from "@/entities/todo";
import { userReducer } from "@/entities/user";

export const store = configureStore({
  reducer: {
    todos: todoReducer,
    user: userReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
```

The store imports each slice's reducer through its public API
(`index.ts`), never reaching into `model/` directly (Rule 4-2). Do not
let individual slices create their own stores.

## State Management: TanStack Query (React Query)

Guidance applies to `@tanstack/react-query` v5 (formerly React Query). The
package name is `@tanstack/react-query`.

### Where to store query keys

Three placements are valid. Choose based on project size and whether the
project already has an Entities layer.

**Option 1: Flat in `shared/api/queries/`** (small projects, few endpoints):

```text
shared/api/
  queries/
    example.ts
    another-example.ts
  index.ts          ← export { exampleQueries } from './queries/example';
```

**Option 2: Per controller in `shared/api/<controller>/`** (many endpoints):

```text
shared/api/example/
  index.ts          ← export { exampleQueries } from './example.query';
  example.query.ts  ← Query factory: keys + functions
  get-example.ts
  create-example.ts
  update-example.ts
  delete-example.ts
```

**Option 3: Per entity in `entities/<entity>/api/`** when each request
corresponds to a single entity, and the project already has an Entities
layer. When entities reference each other, see
`references/cross-import-patterns.md` for `@x` notation as a last resort.

### Where to store mutations

Do not mix mutations with queries. Two patterns are accepted:

1. **A mutation hook in the `api/` segment near the place of use.** Use
   `setQueryData` for cache updates:

   ```typescript
   // src/pages/example/api/use-update-example.ts
   export const useUpdateExample = () => {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: ({ id, newTitle }) => apiClient.patch(`/posts/${id}`, { title: newTitle }).then((r) => r.data),
       onSuccess: (newPost, { id }) => queryClient.setQueryData(POST_QUERIES.detail({ id }).queryKey, newPost),
     });
   };
   ```

2. **A `mutationFn` defined in `shared/` or `entities/`** and called from
   `useMutation` in the component.

### Query factory pattern

A query factory is an object whose values return query keys. Each key is
wrapped in `queryOptions`, a built-in helper from `@tanstack/react-query` v5
that lets you share `queryKey` and `queryFn` between `useQuery`,
`useSuspenseQuery`, `prefetchQuery`, `setQueryData`, and similar APIs
without rewriting them:

```typescript
// src/shared/api/post/post.queries.ts
import { queryOptions } from "@tanstack/react-query";
import { getPosts, getDetailPost, type DetailPostQuery } from "./get-posts";

export const POST_QUERIES = {
  all: () => ["posts"],
  lists: () => [...POST_QUERIES.all(), "list"],
  list: (page: number, limit: number) => queryOptions({
    queryKey: [...POST_QUERIES.lists(), page, limit],
    queryFn: () => getPosts(page, limit),
    placeholderData: (prev) => prev,
  }),
  detail: (query?: DetailPostQuery) => queryOptions({
    queryKey: [...POST_QUERIES.all(), "detail", query?.id],
    queryFn: () => getDetailPost({ id: query?.id }),
  }),
};
```

Consume with `useQuery(POST_QUERIES.detail({ id }))`. For pagination,
`placeholderData: prev => prev` prevents UI flicker when navigating pages.

**Benefits of a query factory:** all API requests for a domain live in one
place (readability), every key and query function is reachable through the
same object (convenient access), and refetching is a one-line call
(`queryClient.invalidateQueries({ queryKey: POST_QUERIES.all() })`) without
hunting down keys across the codebase.

### Infinite scroll

Use `infiniteQueryOptions` with `initialPageParam` and `getNextPageParam`.
Add the infinite key to the same factory shown above:

```typescript
import { infiniteQueryOptions } from "@tanstack/react-query";

// Inside POST_QUERIES:
infinite: (limit: number) => infiniteQueryOptions({
  queryKey: [...POST_QUERIES.lists(), "infinite", limit],
  queryFn: ({ pageParam }) => getPosts(pageParam, limit),
  initialPageParam: 0,
  getNextPageParam: (lastPage) => lastPage.skip + lastPage.limit < lastPage.total ? lastPage.skip / lastPage.limit + 1 : undefined,
}),
```

Consume with `useInfiniteQuery` and flatten via `data?.pages.flatMap(...)`.

### Suspense mode

`queryOptions` and `useSuspenseQuery` are compatible, and the factory does
not change. Components use `useSuspenseQuery` instead of `useQuery` and skip
`isLoading` entirely. Wrap interested subtrees with an `ErrorBoundary` +
`Suspense` provider in the App layer:

```tsx
// src/app/providers/suspense-provider.tsx
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

export const SuspenseProvider = ({ children }) => (
  <ErrorBoundary fallback={<div>Something went wrong</div>}>
    <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
  </ErrorBoundary>
);
```

### Reading mutation state with useMutationState

`useMutationState` lets any component read the state of a mutation without
passing props, useful for global save indicators. Store mutation keys next
to the query factory:

```typescript
// src/shared/api/post/post.queries.ts
export const POST_MUTATIONS = {
  updateTitle: () => ["post", "update-title"],
  create: () => ["post", "create"],
};
```

Tag the mutation with `mutationKey`, then read its state from any component:

```tsx
// src/features/update-post/api/use-update-post-title.ts
export const useUpdatePostTitle = () =>
  useMutation({
    mutationKey: POST_MUTATIONS.updateTitle(),
    mutationFn: ({ id, newTitle }) => apiClient.patch(`/posts/${id}`, { title: newTitle }),
  });

// src/widgets/save-indicator/ui/save-indicator.tsx
import { useMutationState } from "@tanstack/react-query";
import { POST_MUTATIONS } from "@/shared/api/post";

export const SaveIndicator = () => {
  const isPending = useMutationState({
    filters: { mutationKey: POST_MUTATIONS.updateTitle(), status: "pending" },
    select: (m) => m.state.status,
  }).length > 0;
  return isPending && <span>Saving...</span>;
};
```

### QueryProvider in the app layer

```tsx
// src/app/providers/query-provider.tsx
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { toast } from "sonner";

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (e) => toast.error(e.message) }),
  mutationCache: new MutationCache({ onError: (e) => toast.error(e.message) }),
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, gcTime: 5 * 60 * 1000 } },
});

export const QueryProvider = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    {children}
    <ReactQueryDevtools />
  </QueryClientProvider>
);
```

`QueryCache.onError` and `MutationCache.onError` give one place to wire up
global toast notifications instead of repeating error handling on every hook.

### Code generation

Tools that generate clients from an OpenAPI/Swagger spec are less flexible
than hand-written factories. If your spec is clean and you adopt a generator,
place the generated code in `@/shared/api/`.

### Custom API client

Standardize base URL, headers, and JSON handling in a single class in
`shared/api/`:

```typescript
// src/shared/api/api-client.ts
export class ApiClient {
  #baseUrl: string;
  constructor(url: string) { this.#baseUrl = url; }

  async #handle<T>(response: Response): Promise<T> {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  get = <T>(path: string) => fetch(`${this.#baseUrl}${path}`).then((r) => this.#handle<T>(r));
  // post, put, delete follow the same pattern with method/headers/body.
}

export const apiClient = new ApiClient(API_URL);
```

**Key principle:** Place query and mutation hooks in the slice that owns the
domain. Page-specific queries stay in the page. Shared queries go in
`shared/api/` or `entities/<name>/api/` depending on whether the project has
an Entities layer.

## See also

- [Sample project on GitHub](https://github.com/ruslan4432013/fsd-react-query-example)
- [Query options API (tkdodo blog)](https://tkdodo.eu/blog/the-query-options-api)
