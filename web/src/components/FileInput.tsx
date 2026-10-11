import { useRef, useState } from 'react';

export default function FileInput({
  accept,
  disabled,
  onFile,
  label = 'Choose file',
}: {
  accept?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="file-input">
      <input
        ref={inputRef}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        accept={accept}
        disabled={disabled}
        className="file-input-native"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setFileName(file.name);
            onFile(file);
          }
        }}
      />
      <button type="button" className="secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {label}
      </button>
      <span className="file-input-name">{fileName ?? 'No file chosen'}</span>
    </div>
  );
}
