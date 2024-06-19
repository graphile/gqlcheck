# gqlcheck

This tool is designed to perform checks against your GraphQL documents (which
contain one or more query, mutation or subscription operations and any
associated fragments) before you ship them to production, to help ensure the
safety of your servers. You should use it alongside other tooling such as
[trusted documents](https://benjie.dev/graphql/trusted-documents) and
[GraphQL-ESLint](https://the-guild.dev/graphql/eslint/docs) to ensure you're
shipping the best GraphQL you can.

What sets this tool apart is that it allows you to capture (and allowlist) the
current state of your existing operations, called the "baseline", whilst
enforcing more rigorous rules against future operations (and against new fields
added to existing operations). You can thus safely adopt this tool with strict
rules enabled, even if you've been lenient with your GraphQL operations up until
this point, without breaking existing operations.

## Works with any GraphQL system

This tool takes the SDL describing your GraphQL schema and your GraphQL
documents as inputs, and as output gives you a pass or a fail (with details). So
long as you can represent your GraphQL documents as a string using the GraphQL
language, and you can introspect your schema to produce an SDL file, you can use
this tool to check your documents. (Supports the latest draft of the GraphQL
specification.)

## Fast

This tool uses a worker pool to distribute validation work across all the cores
of your CPU. We don't want to slow down your CI or deploy process any more than
we have to! We're also very careful to write the rules in a performant manner,
leaning into the visitor pattern exposed by GraphQL.js and avoiding manual AST
traversal where possible.

## Designed to work with persisted operations

Persisted queries, persisted operations, stored operations, trusted documents...
Whatever you call them, this system is designed to perform checks on your new
documents before you persist them. This means that your server will not have to
run expensive validation rules (or know about your overrides) in production -
only the operations that you have persisted (and have checked with this tool)
should be allowed. Read more about
[trusted documents](https://benjie.dev/graphql/trusted-documents); a pattern
that is usable with any GraphQL server in any language.

## Rules

Other than the specified GraphQL validation rules, this tool also checks a few
other things. Each check can be configured or disabled, and can be overridden to
allow existing operations to pass.

### Field depth

Setting: `maxDepth` (normal) and `maxIntrospectionDepth` (for introspection
queries).

Check that your operations aren't too deep.

(Leaf nodes are ignored.)

### List depth

Setting: `maxListDepth` (normal) and `maxIntrospectionListDepth` (for
introspection queries).

Checks that lists aren't being nested too many times, leading to potential
response amplification attacks; e.g.
`{ user { friends { friends { friends { friends { friends { name } } } } } } }`.

(Leaf nodes are ignored, even if they are lists.)

### Self-referential depth

Setting: `maxSelfReferentialDepth` and `maxDepthByFieldCoordinates[coords]`

Attackers often look to exploit cycles in your schema; in general it's unlikely
you'd want to visit the same field multiple times, so this rule only allows a
field to be referenced once inside itself (i.e. it allows "friends of friends"
but not "friends of friends of friends").

Should you need to, you can override this on a per-field basis by specifying a
higher limit using the field's
[schema coordinate](https://github.com/graphql/graphql-wg/blob/main/rfcs/SchemaCoordinates.md)
(i.e. `TypeName.fieldName`). For example, to allow "friends of friends of
friends" you might configure with:

```ts
    maxSelfReferentialDepth: 2,
    maxDepthByFieldCoordinates: {
      "User.friends": 3,
    },
```

## Baselines

When you get started with `gqlcheck` you'll want to capture the current state of
your GraphQL operations (you can do this with the `-u` CLI flag). This will
ensure that all existing operations continue to function (i.e. are allowed)
whilst trying to avoid any issues getting worse. For example, if you set a
default `maxDepth` limit of `8` but one of your existing queries has a depth of
`12`, you'd still want that existing query to continue working.

`gqlcheck` is intelligent - it doesn't just capture the required settings values
for the operation as a whole, it captures the
[operation expression path](https://github.com/graphql/graphql-wg/blob/main/rfcs/OperationExpressions.md)
that describes where the issue occurred, this allows it to bless that particular
path whilst still preventing depth creep in other areas of that same named
operation.

The baseline is only intended to be captured when you first start running the
system, or when you do a software update that introduces new rules (and you're
already in a "clean" state), since it will hide "known" issues from being
reported.

## Configuration

If the CLI flags are not enough, configuration is performed via a
`graphile.config.mjs` file. Global settings are stored under the
`gqlcheck.config` path, and named-operation overrides under
`gqlcheck.operationOverrides[operationName]`. In future, `plugins` may be added
to the configuration to allow supporting additional rules.

### Example configuration

The below `graphile.config.mjs` file demonstrates the key settings you are
likely to want to change. For full configuration options, use TypeScript.

```ts
// @ts-check

// The following comment requires TypeScript 5.5+ to work
/** @import {} from 'gqlcheck' */

/** @type {GraphileConfig.Preset} */
const preset = {
  gqlcheck: {
    // How many workers should we spawn in the background? Defaults to the
    // number of CPUs on this machine since walking ASTs is single threaded.
    // workerCount: 4,

    // Update this to be the path to your GraphQL schema in SDL format. We
    // currently only support loading an SDL from the file system.
    schemaSdlPath: "schema.graphqls",

    // Enable this setting so that a baseline may be used to hide issues that
    // were present before you adopted `gqlcheck`.
    baselinePath: "baseline.json5",

    config: {
      // How many fields deep can you go?
      maxDepth: 12,

      // How many lists deep can you go?
      maxListDepth: 4,

      // How many layers deep can a field reference itself
      maxSelfReferentialDepth: 2,

      // If certain of your coordinates need to be deeply nested (or must never
      // be nested), list them here with their maximum depth values (1+).
      maxDepthByFieldCoordinates: {
        // "User.friends": 1,
        // "Comment.comments": 5,
      },
    },
  },
};

export default preset;
```

### Per-operation overrides

Overrides in `gqlcheck` operate on a per-operation-name basis; this is because
your operations will likely evolve over time, so overrides need to apply not
only to the current version of the operation but also all past and future
versions too, even if they're not in the same file name. Every setting can be
overridden on a per-operation basis,

```ts
const preset = {
  gqlcheck: {
    config: {
      maxDepth: 12,
      maxListDepth: 4,
      maxSelfReferentialDepth: 2,
    },

    operationOverrides: {
      // Override the above global settings for the 'MyLegacyQuery' operation
      MyLegacyQuery: {
        maxDepth: 32,
        maxListDepth: 10,
        maxDepthByFieldCoordinates: {
          "User.friends": 5,
        },
      },
    },
  },
};

export default preset;
```

## Installation

```
npm install gqlcheck
```

## Usage

If you have configured the `schemaSdlPath` then you can run `gqlcheck` passing
the paths to files to check:

```
gqlcheck query1.graphql query2.graphql query3.graphql
```

Otherwise, pass the `-s path/to/schema.graphqls` option to specify where your
schema SDL is.

You can also pass `-b baseline.json5` to identify your baseline file; and use
`-u` to update the baseline such that all current documents are allowed.

## FAQ

### Do I have to use the `.graphqls` extension for my schema?

No. It just helps to differentiate it from the executable documents.

### Why should I trust you?

I'm a
[member of the GraphQL TSC](https://github.com/graphql/graphql-wg/blob/main/GraphQL-TSC.md#tsc-members)
and one of the
[top contributors to the GraphQL spec](https://github.com/graphql/graphql-spec/graphs/contributors).

### This is awesome, how can I support you?

I'm a community-funded open source maintainer, which means that sponsorship from
folks like you helps me to take time off from client work to work on open
source. This project was initially sponsored by Steelhead Technologies (thanks
Steelhead! ❤️) but over time there will almost certainly be feature requests,
bug reports, and maintenance work required. Not to mention that I have a lot of
other open source projects too!

💖 Please sponsor me: https://github.com/sponsors/benjie 🙏

## See also

- [GraphQL-ESLint](https://the-guild.dev/graphql/eslint/docs) for general
  GraphQL linting
- [Trusted documents](https://benjie.dev/graphql/trusted-documents) to protect
  your server from untrusted queries
- [@graphile/depth-limit](https://github.com/graphile/depth-limit) to help
  reduce

## Thanks

The initial work on this project was funded by Steelhead Technologies - thanks
Steelhead!
