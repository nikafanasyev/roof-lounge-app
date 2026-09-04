interface StarsProps {
  value: number; // 0-5, допускаются дробные для среднего
  onRate?: (value: number) => void;
}

export function Stars({ value, onRate }: StarsProps) {
  const rounded = Math.round(value);
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onClick={onRate ? () => onRate(n) : undefined}
          style={{ cursor: onRate ? "pointer" : "default" }}
        >
          {n <= rounded ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}
