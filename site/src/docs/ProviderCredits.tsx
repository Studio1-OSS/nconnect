const providers = [
  {
    role: "Inference by",
    name: "Nebius Token Factory",
    href: "https://tokenfactory.nebius.com",
    mark: "/nebius-token-factory-mark.png",
  },
  {
    role: "Web search by",
    name: "Tavily",
    href: "https://tavily.com",
    mark: "/tavily-icon.png",
  },
] as const;

/**
 * One quiet line crediting the providers behind NConnect, used on the docs
 * overview. Marks are small and grayscale at rest (colour on hover) so they
 * read as attribution, not ads. Styles live in docs.css (.provider-credits).
 */
export function ProviderCredits({ className = "" }: { className?: string }) {
  return (
    <p className={`provider-credits ${className}`}>
      {providers.map((provider) => (
        <span className="provider-credit" key={provider.name}>
          <span className="provider-credit-role">{provider.role}</span>
          <a href={provider.href} target="_blank" rel="noopener noreferrer">
            <img src={provider.mark} width="16" height="16" alt="" />
            {provider.name}
          </a>
        </span>
      ))}
    </p>
  );
}
