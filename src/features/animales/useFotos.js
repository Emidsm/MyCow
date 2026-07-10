import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { writesFor } from '../../sync/writes.js';
import { db as defaultDb } from '../../sync/db.js';
import { supabase } from '../../lib/supabaseClient.js';

const BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'mycow_fotos';
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
        const data_url = canvas.toDataURL('image/jpeg', QUALITY);
        canvas.toBlob((blob) => resolve({ data_url, blob }), 'image/jpeg', QUALITY);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fotoUrl(foto) {
  if (foto?.storage_path) {
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(foto.storage_path);
    return publicUrl;
  }
  return null;
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
    const { data_url, blob } = await resizeImage(file);

    const storage_path = `animales/${animalClientId}/${uuidv4()}.jpg`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storage_path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (uploadError) {
      console.warn('Foto no subió a Storage, guardando solo local:', uploadError.message);
    }

    const foto = await writes.fotos.create({
      animal_id: animalClientId,
      storage_path: uploadError ? null : storage_path,
    });
    await db.fotos_data.put({ client_id: foto.client_id, data_url });
    return foto;
  }

  async function removeFoto(fotoClientId) {
    const foto = fotos.find((f) => f.client_id === fotoClientId);
    if (foto?.storage_path) {
      await supabase.storage.from(BUCKET).remove([foto.storage_path]).catch(() => {});
    }
    await writes.fotos.softDelete(fotoClientId);
    await db.fotos_data.delete(fotoClientId);
  }

  const fotoPrincipal = fotos.length > 0 ? fotos[0] : null;
  const fotoPrincipalRec = fotosData.find((d) => d.client_id === fotoPrincipal?.client_id);
  const fotoPrincipalUrl = fotoPrincipal?.storage_path
    ? fotoUrl(fotoPrincipal)
    : (fotoPrincipalRec?.data_url ?? null);

  return {
    fotos,
    fotosData,
    fotoPrincipal,
    fotoPrincipalUrl,
    fotoPrincipalData: fotoPrincipalRec?.data_url ?? null,
    addFoto,
    removeFoto,
    fotoUrl: (f) => fotoUrl(f),
  };
}
