import { useRef } from 'react';
import './FotoUpload.css';

export function FotoUpload({ dataUrl, onUpload, onRemove }) {
  const inputRef = useRef(null);

  function handleClick() {
    if (dataUrl) {
      onRemove();
    } else {
      inputRef.current?.click();
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpload(file);
    e.target.value = '';
  }

  return (
    <div className="foto-upload">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="foto-upload__input"
        onChange={handleFile}
      />
      {dataUrl ? (
        <div className="foto-upload__preview">
          <img src={dataUrl} alt="Foto del animal" className="foto-upload__img" />
          <button type="button" className="foto-upload__remove" onClick={handleClick} aria-label="Eliminar foto">
            ×
          </button>
        </div>
      ) : (
        <button type="button" className="foto-upload__add" onClick={handleClick}>
          <span className="foto-upload__icon">+</span>
          <span>Agregar foto</span>
        </button>
      )}
    </div>
  );
}
