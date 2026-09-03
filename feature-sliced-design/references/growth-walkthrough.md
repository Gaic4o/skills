# Growth Walkthrough

One small shop followed through four snapshots. Each snapshot shows the
tree, what changed in the product, and which rule from `SKILL.md` decided
the response. Two of the four moments create nothing, and that is the
point: a layer is earned by a rule that needs one home, not by a count of
how many places use something.

This is not a migration. Nothing below was wrong and then fixed. Read it
when starting a project, or when asked "should we add entities yet?"

## Snapshot 0: two pages, three layers

The shop has a home page with a product list and a product detail page.
The detail page shows an "on sale" badge.

```text
src/
  app/
    providers/
    router.tsx
    styles/
  pages/
    home/
      ui/HomePage.tsx
      ui/ProductCard.tsx        ← list card, used only here
      index.ts
    product/
      ui/ProductPage.tsx
      ui/SaleBadge.tsx          ← badge, used only here
      model/is-on-sale.ts       ← the rule: price < listPrice
      index.ts
  shared/
    api/
      client.ts
      endpoints/product.ts      ← ProductDTO, fetchProduct, fetchProducts
      index.ts
    ui/
      Button/
      Card/
```

**What is absent on purpose.** No `entities/`, no `features/`, no
`widgets/`. The product DTO and its request functions sit in `shared/api`
because knowing a URL and a response shape is infrastructure, not a
product rule (Section 2, Step 2). The sale rule sits in the product page
because only that page applies it (Step 1). This is complete, valid FSD
(Section 5-3).

## Snapshot 1: a third page reuses product data, nothing new appears

A search page is added. It fetches products and shows them as cards.

```text
  pages/
    search/                     ← new slice
      ui/SearchPage.tsx
      ui/ProductCard.tsx        ← a second card, copied from home
      index.ts
```

**What the search page needs, it already has.** `ProductDTO` and
`fetchProducts` come from `@/shared/api`, which was their home from the
start. Three pages now read the same product data and that changes
nothing: request functions and response types stay in `shared/api` no
matter how many slices call them (`references/auth-and-api.md`, request
placement rule, Question 2). The official API requests guide says the
same: avoid placing API calls and response types in `entities`
prematurely.

**The second card is a copy, not an extraction.** Two `ProductCard`
files look like a signal for `entities/product/ui`. They are not, yet.
The search card shows a match snippet and the home card does not, so they
are not the same code, and they will keep drifting apart for their own
reasons. Step 1 covers this case directly: used in two pages but the
duplication is manageable, so separate copies are valid. Extracting now
would force two cards that want to differ into one component that has to
serve both.

## Snapshot 2: a rule diverges, `entities/product` appears

Marketing changes what "on sale" means: the price must be below the list
price *and* the item must be in stock. The product page is updated. The
search page, which copied the old rule when it copied the card, is not.
Search now shows a sale badge on items the detail page says are not on
sale.

This is the signal. The two copies are the same rule, they must agree,
and they no longer do. Check the three conditions in Section 1:

1. The same code is used in multiple places right now. Yes, two pages.
2. The usages do not always change together. Yes: the rule changes when
   marketing changes it, not when either page changes.
3. The boundary has a focused responsibility. Yes: "is this product on
   sale" and nothing else.

All three hold, so the rule gets one home (Step 4).

```text
  entities/                     ← new layer
    product/
      model/is-on-sale.ts       ← moved from pages/product; the one home
      index.ts
  pages/
    product/
      ui/SaleBadge.tsx          ← stays; now calls isOnSale from
                                   @/entities/product
    search/
      ui/ProductCard.tsx        ← stays; calls the same isOnSale
  shared/
    api/
      endpoints/product.ts      ← ProductDTO stays here
```

**What did not move.** The DTO stays in `shared/api`. The official
excessive-entities guide keeps data definitions in `shared/api` even for
reusable business logic and moves only the logic into the entity's
`model` (Section 5-2, item 3). The badge and the cards stay in their
pages: they are UI, and Section 6 warns against adding UI to entities
until there is a reason. The entity is one file and an index. That is
enough.

## Snapshot 3: an action is reused, `features/add-to-cart` appears

The product page has had an "Add to cart" button since Snapshot 0, with
its request and an optimistic cart update in the page's `api` and `model`
segments. Search results now get the same button.

Step 3 asks whether this is a complete user action, used in multiple
places, with a stable boundary. The button, the request, and the cart
update form one action; two pages use it; adding to the cart means the
same thing from either page. Extract it.

```text
  features/                     ← new layer
    add-to-cart/
      ui/AddToCartButton.tsx
      api/add-to-cart.ts        ← owned by one feature, so it lives here
      model/cart-store.ts       ← cart state; only this feature touches it
      index.ts
  pages/
    product/
      ui/ProductPage.tsx        ← renders <AddToCartButton />
    search/
      ui/ProductCard.tsx        ← renders <AddToCartButton />
```

**What did not appear.** A `cart` entity. The cart store has exactly one
consumer, this feature, so Step 4 keeps it where it is. A `widgets/`
layer. Nothing in four snapshots needed one, and the callout in Section 1
says not to reach for it.

## What the walkthrough shows

| Moment | Trigger | Response | Rule |
| --- | --- | --- | --- |
| 0 | Two pages | `app/`, `pages/`, `shared/` | Section 5-3 |
| 1 | Third page reads product data | Nothing new; copy the card | Step 1, Step 2 |
| 2 | Same rule, two copies, one stale | `entities/product/model` | Section 1, Step 4 |
| 3 | Same complete action on two pages | `features/add-to-cart` | Step 3 |

Reuse alone opened no layer. A rule that had to agree with itself opened
`entities`; a complete action that two pages perform opened `features`.
Everything else stayed where it was used.

Once a layer exists, `references/layer-structure.md` shows the full shape
of its slices and segments. This file only shows the moment it appears.
