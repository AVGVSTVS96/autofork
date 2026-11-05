import type { SubmitEvent } from "react";

export const Composer = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  action,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  placeholder: string;
  label: string;
  action: string;
  disabled: boolean;
}) => {
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = value.trim();

    if (text && !disabled) {
      onSubmit(text);
    }
  };

  return (
    <form className="ask" onSubmit={submit}>
      <label className="field" data-value={value}>
        <textarea
          rows={1}
          value={value}
          onChange={(event) => {
            onChange(event.target.value.replaceAll("\n", " "));
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) {
              return;
            }

            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          placeholder={placeholder}
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button type="submit" disabled={disabled}>
        {action}
      </button>
    </form>
  );
};
