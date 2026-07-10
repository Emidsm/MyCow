import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { writesFor } from '../../sync/writes.js';
import { db as defaultDb } from '../../sync/db.js';

const MAX_DIM = 800;
const QUALITY = 0.7;

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', QUALITY));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function useFotos(animalClientId, db = defaultDb) {
  const writes = useMemo(() => writesFor(db), [db]);

  const fotos = useLiveQuery(
    () => db.fotos.filter((f) => f.animal_id === animalClientId && f.deleted_at == null).toArray(),
    [db, animalClientId],
    []
  );

  const fotosData = useLiveQuery(
    () => {
      if (fotos.length === 0) return [];
      return Promise.all(
        fotos.map((f) =>
          db.fotos_data.get(f.client_id).then((d) => ({ client_id: f.client_id, data_url: d?.data_url ?? null }))
        )
      );
    },
    [db, fotos],
    []
  );

  async function addFoto(file) {
    const data_url = await resizeImage(file);
    const foto = await writes.fotos.create({ animal_id: animalClientId });
    await db.fotos_data.put({ client_id: foto.client_id, data_url });
    return foto;
  }

  async function removeFoto(fotoClientId) {
    await writes.fotos.softDelete(fotoClientId);
    await db.fotos_data.delete(fotoClientId);
  }

  const fotoPrincipal = fotos.length > 0 ? fotos[0] : null;
  const fotoPrincipalData = fotosData.find((d) => d.client_id === fotoPrincipal?.client_id);

  return { fotos, fotosData, fotoPrincipal, fotoPrincipalData: fotoPrincipalData?.data_url ?? null, addFoto, removeFoto };
}
