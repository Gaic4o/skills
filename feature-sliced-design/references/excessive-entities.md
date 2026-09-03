# Excessive Entities

How to keep the `entities` layer clean and avoid over-extracting business
logic into entities. Excessive entities cause ambiguity (what code belongs
where), coupling, and constant import dilemmas as code scatters across
sibling entities.

## Why this matters

The `entities` layer is one of the lower layers and is widely accessible.
Every layer except `shared` can import from it. That global nature means
changes to `entities` propagate widely, so the boundaries need care up
front to avoid costly refactors. Adding an entity is cheap; removing one
after many consumers depend on it is expensive.

## How to keep entities clean

### 0. Consider having no entities layer

An FSD application without an `entities` layer is still FSD. Skipping the
layer simplifies the architecture and keeps it available for future scaling.

**Thin clients** (where the backend handles most data processing and the
client mostly exchanges data) usually do not need an entities layer.
**Thick clients** (significant client-side business logic) are better
candidates for entities.

The classification is not strictly binary. Different parts of the same
application may behave as thick or thin clients.

```text
// Thin client without entities layer (still valid FSD)
src/
  app/
  pages/
    dashboard/
    profile/
  shared/
    api/
    ui/
```

### 1. Avoid preemptive slicing

FSD v2.1 encourages **deferred decomposition** of slices. Place code in the
`model` segment of the consuming page (widget, feature) first. Move it to
`entities` later, when business requirements stabilize and reuse is
confirmed across multiple consumers.

The later code moves to `entities`, the less dangerous the refactor. Code
in `entities` can affect every higher-layer slice that imports it.

```text
// Iteration 1: code lives where it is used
pages/profile/
  model/
    profile-validation.ts    ← page-specific for now

// Iteration 2 (after the same logic is needed in 2+ places):
entities/profile/
  model/
    profile-validation.ts    ← extracted only after reuse is real
```

### 2. Avoid unnecessary entities

Do not create an entity for every piece of business logic. Use types from
`shared/api` and place logic in the `model` segment of the current slice.
For genuinely reusable business logic, use the `model` segment within an
entity slice while keeping data definitions in `shared/api`.

```text
shared/
  api/
    endpoints/
      order.ts              ← OrderDto type and request functions

entities/
  order/
    model/
      apply-discount.ts     ← Business logic that uses OrderDto
    index.ts
```

The DTO lives in `shared/api/endpoints/order.ts`. Business logic that
operates on it (calculating discounts, applying promotions) lives in
`entities/order/model/`. Do not mirror every API endpoint with a
corresponding entity.

### 3. Exclude CRUD operations from entities

CRUD operations involve boilerplate code without significant business
logic. Putting them in `entities` clutters the layer and obscures the code
that genuinely matters. Place CRUD in `shared/api`:

```text
shared/
  api/
    client.ts
    endpoints/
      order.ts          ← getOrder, createOrder, updateOrder, deleteOrder
      products.ts       ← Standard CRUD for products
      cart.ts           ← Standard CRUD for cart
    index.ts
```

For complex CRUD with atomic updates, rollbacks, or transactions, evaluate
whether the operation is genuinely business logic. If so, the `entities`
layer may be appropriate. If not, keep it in `shared/api`.

### 4. Store authentication data in shared

Prefer `shared/auth` (or `shared/api`) over a `user` entity for tokens and
session DTOs. They are specific to authentication, rarely reused outside
it, and wrapping a login response in a `user` entity tends to pull the
entity into `@x` chains. A `user` entity is the right call only when the
project already has an entities layer and profile data is genuinely reused
for non-auth purposes (avatars in comments, names in posts). Until then
the entity is premature.

Both folder shapes, when to split `shared/auth` from `shared/api`, and the
three ways to expose the token to the API client are in
`references/auth-and-api.md`.

### 5. Minimize cross-imports

FSD permits cross-imports between entities via `@x`, but they introduce
technical issues including circular dependencies. Design entities within
**isolated business contexts** so cross-imports become unnecessary.

**Non-isolated context (avoid):**

```text
entities/
  order/
    @x/
    model/
  order-item/
    @x/
    model/
  order-customer-info/
    @x/
    model/
```

Three sibling entities all referencing each other through `@x`. This is a
sign that the boundaries are wrong.

**Isolated context (preferred):**

```text
entities/
  order-info/
    model/
      order-info.ts    ← order, items, and customer info together
    index.ts
```

One entity encapsulates the related logic, so there is no `@x` file and
no way for the sibling slices to form a cycle.

The general rule: when several entities have `@x` dependencies on each
other, treat that as a signal to merge the boundaries, not as something to
manage.

## Decision tree for AI agents

```text
A new piece of business logic needs a home.
  │
  ├─ Is the project a thin client?
  │   └─ YES → Skip entities. Place in shared/ + page model.
  │
  ├─ Is the logic used in only one place right now?
  │   └─ YES → Keep in the consuming slice's model/. Defer extraction.
  │
  ├─ Is it a CRUD operation without business meaning?
  │   └─ YES → shared/api/endpoints/<resource>.ts
  │
  ├─ Is it auth data (tokens, session, login DTOs)?
  │   ├─ Project has no entities layer yet?
  │   │   └─ YES → shared/auth/
  │   ├─ Auth and profile data tightly coupled, entities layer exists?
  │   │   └─ YES → entities/user/
  │   └─ Otherwise → shared/auth/ (default).
  │       Avoid placing in a page, widget, or single feature slice.
  │
  ├─ Is it just a TypeScript type for an API response?
  │   └─ YES → shared/api/. No entity needed for types alone.
  │
  └─ Is it reusable domain logic confirmed in 2+ consumers?
      └─ YES → Create entities/<name>/model/.
               Verify the boundary is isolated and does not require @x
               to communicate with sibling entities.
```

## Anti-patterns

- **Creating entities preemptively.** Wait for confirmed reuse in 2+
  consumers, not anticipated reuse.
- **Mirroring every API endpoint with an entity.** API endpoints belong in
  `shared/api`. Entities exist for business logic, not for paralleling the
  backend structure.
- **Creating a `user` entity *only* to wrap a login response.** A `user`
  entity is justified when profile data is reused across non-auth flows
  (avatars in comments, names in posts) or when token logic is genuinely
  tied to user business logic. Until that reuse appears, `shared/auth`
  is simpler. Storing tokens in a page, widget, or single feature slice is
  discouraged regardless of the project shape.
- **Splitting one domain into many entities (`order`, `order-item`,
  `order-customer-info`).** This produces `@x` chains. Merge into a single
  isolated context (`order-info` or `order`).
- **Putting CRUD wrappers in entities.** They clutter the layer. CRUD goes
  in `shared/api/endpoints/`.

## See also

- `references/cross-import-patterns.md`: how to handle cross-imports when
  they appear, and why `@x` is a last resort.
- `references/layer-structure.md`: layer responsibilities and the entities
  segment shape.
