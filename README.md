# @graphile/doccheck

This tool is designed to perform checks against your GraphQL operations
(documents) before you ship them to production, to help ensure the safety of
your servers. You should use it alongside other tooling such as [trusted
documents](https://benjie.dev/graphql/trusted-documents) and
[GraphQL-ESLint](https://the-guild.dev/graphql/eslint/docs) to ensure you're
shipping the best GraphQL you can be.

What sets this tool apart is that it allows you to capture (and allowlist) the
current state of your existing operations, whilst enforcing more rigorous rules
against future operations (and against new fields added to existing
operations). You can thus safely adopt this tool with strict rules enabled,
even if you've been lenient with your GraphQL operations up until this point,
without breaking existing operations and knowing that future operations and
fields will be more strictly analyzed.

## Works with any GraphQL system

This tool takes the SDL describing your GraphQL schema and your GraphQL
documents as inputs, and as output gives you a pass or a fail (with details).
So long as you can represent your GraphQL documents as a string using the
GraphQL language, and you can introspect your schema to produce an SDL file,
you can use this tool to check your documents.

## Fast

This tool uses a worker pool to distribute validation work across all the cores
of your CPU. We don't want to slow down your CI or deploy process any more than
we have to!

## Designed to work with persisted operations

Persisted queries, persisted operations, stored operations, trusted
documents... Whatever you call them, this system is designed to perform checks
on your new documents before you persist them. This means that your server
will not have to run expensive validation rules (or know about the overrides)
in production - only the operations that you have persisted (and have checked
with this tool) will be allowed. Read more about [trusted
documents](https://benjie.dev/graphql/trusted-documents); a pattern that is
usable with any GraphQL server in any language.

## Rules

Other than the specified GraphQL validation rules, this tool also checks a few
other things. Each check can be configured or disabled, and can be overridden
to allow existing operations to pass.

### List and query depth

Similar to the [@graphile/depth-limit](https://github.com/graphile/depth-limit)
GraphQL validation rule, this tool will check that your operations aren't too
deep - in particular looking for places where you have requested lists of lists
of lists of lists.

## Overrides

Overrides are configured using operation-anchored (i.e. traversing through
fragments) [operation
expressions](https://github.com/graphql/graphql-wg/blob/main/rfcs/OperationExpressions.md),
these allow you to override specific fields within specific named operations,
for maximal flexibility.

## Thanks

The initial work on this project was funded by Steelhead Technologies - thanks Steelhead!
