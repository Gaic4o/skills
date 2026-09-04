# Asset Handling

How to place static assets (images, icons, fonts, PDFs, stylesheets) inside an
FSD project. Assets follow the same placement rules as code: group by use
case, not by type, and keep them next to the code that uses them.

> **Caution:** A custom top-level `assets` segment that aggregates all static
> files is **not recommended**. It violates the FSD principles of high
> cohesion and locality of changes. Place assets where they are used.

## Decision tree

1. **Used by one slice?** Keep the asset inside that slice, usually in the
   `ui/` segment, or in `model/` if it is part of business logic.
2. **Must several consumers share one authoritative copy (a logo, the
   placeholder icon)?** Put it with the shared module that owns it, which
   for a presentation asset is `shared/ui/`. Two assets that merely look
   alike today and will change for their own reasons stay local.
3. **Global stylesheet, font, or app-level resource?** Place it in the
   `app/` layer, by convention `app/styles/` and `app/fonts/`.
4. **Served as-is by the bundler (favicon, robots.txt)?** Use the framework's
   `public/` folder. The `public/` folder is not part of FSD and does not
   conflict with FSD layers.

## Slice-specific assets

When an asset belongs to one page, widget, or feature, keep it inside that
slice. The asset lives next to the component that renders it:

```text
pages/
  home/
    ui/
      hero-image.jpg          ← Used only by HomePage
      HomePage.tsx
    index.ts
```

If a slice uses many static images, group them in a subfolder of `ui/`:

```text
pages/
  home/
    ui/
      previews/
        cake.jpg
        pizza.jpg
        sushi.jpg
      HomePage.tsx
    index.ts
```

### Non-UI assets

Some assets are not part of the UI but are coupled to business logic. For
example, a PDF template used to generate invoices. Place these in the
`model/` segment alongside the logic that consumes them, not in `ui/`:

```text
features/
  billing/
    model/
      invoice-template.pdf    ← Coupled to create-invoice.ts
      create-invoice.ts
    index.ts
```

The principle is locality of changes: if you delete the slice, every file it
owns goes with it. An asset that lives in business logic should sit next to
that logic.

## Shared assets

When several slices must share one authoritative copy of an asset, move it
out of the slices. A presentation asset goes to `shared/ui/`, in a topical
subfolder or next to the single shared component that uses it; anything
else goes with the shared module that owns it:

```text
shared/
  ui/
    placeholders/             ← Reused placeholder images
      cake.jpg
      pizza.jpg
    Dropdown.tsx
    chevron.svg               ← Used only by Dropdown, kept next to it
```

A single icon used by exactly one component in the UI kit stays next to that
component. A library of icons or images reused across many components goes
in a topical subfolder.

## Global assets

Global stylesheets and fonts belong in the `app/` layer because they are
imported by the application entrypoint, not by individual slices:

```text
app/
  styles/
    reset.css
    global.css
  fonts/
    inter.woff2
  main.ts
```

Theme variables, CSS resets, and font registrations are app-wide concerns.
`styles/` and `fonts/` are conventional App folder names, not standardized
ones; `references/layer-structure.md` covers how App segments are named.

## Public folder

Most bundlers expose a `public/` folder at the project root. Files here are
served as-is, without bundling or hashing.

The default is `public/` at the project root in Vite, Next.js, Nuxt, and
Astro. Whether it can be moved is framework-specific: Vite and Astro both
expose a `publicDir` option, while Next.js documents the project root.

`public/` is not part of FSD. It does not collide with FSD layers and does
not need to live under `src/`. Use it for files that must be served at fixed
URLs: favicon, `robots.txt`, `sitemap.xml`, OG images, and similar. A few of
these have framework conventions of their own, such as Next.js metadata
files, and those win over the generic rule.

> **Where this comes from.** The official assets guide says Astro has no
> option to move its public folder. Astro documents `publicDir` with a
> default of `./public` and an example of changing it, so this section
> follows the framework.

```text
public/
  favicon.ico
  robots.txt
  og-image.png
src/
  app/
  pages/
  shared/
```

A bundler whose public directory is configurable, such as Vite, can point
it at a project-local folder next to the entrypoint. That is a config
choice for that project, not a layout to reach for by default.

## Summary table

| Asset                                  | Location                                  |
| -------------------------------------- | ----------------------------------------- |
| Image used by one page/widget/feature  | Inside the slice's `ui/` segment          |
| PDF or template tied to business logic | Inside the slice's `model/` segment       |
| Icon reused across the app             | `shared/ui/` (topical subfolder if many)  |
| Icon used by exactly one shared kit UI | Next to that component in `shared/ui/`    |
| Global CSS reset, theme variables      | `app/styles/`                             |
| Web fonts                              | App layer when bundled, else public dir   |
| Favicon, robots.txt, sitemap           | Framework convention, else public dir     |

## Anti-patterns

- **Do not create a top-level `assets/` segment** that holds all images,
  fonts, and icons. It breaks cohesion and forces consumers to import from a
  folder unrelated to the code they are working on.
- **Do not extract a slice-local asset to `shared/` "in case" it gets
  reused.** Move it only when actual reuse appears.
- **Do not place CSS modules in an `assets/` folder.** A component's
  stylesheet belongs next to that component in `ui/`.
- **Do not name an FSD segment `public`.** The framework's `public/` folder
  is reserved and lives outside `src/`.
- **Do not split assets and the components that use them.** A page that
  ships a hero image should keep that image in the page so removing the page
  removes the image.

## See also

- `references/layer-structure.md`: segment rules and layer organization
- [Desegmentation](https://fsd.how/docs/guides/issues/desegmented/): why
  technical-role grouping (including a generic `assets/` segment) hurts
  cohesion
