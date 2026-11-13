import * as ImagePicker from 'expo-image-picker';
import { toast } from '@/lib/toast';
import { type PickedPhoto, addBatchFiles, openBatch } from './batch.native';
import { loadPhoto } from './photo';
import type { PhotoSource } from './store';

/** Opening photos from the system photo picker (native). */
export async function pickFiles(onFiles: (files: PickedPhoto[]) => void, multiple = false) {
  try {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: multiple,
      selectionLimit: multiple ? 0 : 1,
      quality: 1,
      exif: false,
    });
    if (r.canceled) return;
    onFiles(r.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `photo-${i + 1}.jpg` })));
  } catch (e) {
    toast(`Could not open the photo picker: ${(e as Error).message}`, 'error', 6000);
  }
}

/** Let the user choose one photo. */
export const pickOne = (onPhoto: (source: PhotoSource, name: string) => void) => void pickFiles(([file]) => file && onPhoto(file.uri, file.name));

export const pickPhoto = () => pickOne((uri, name) => void loadPhoto(uri, name));

export const pickBatchPhotos = () => {
  openBatch();
  void pickFiles(addBatchFiles, true);
};
