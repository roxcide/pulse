export async function prepareAvatar(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Выбери изображение JPG, PNG или WebP.");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Изображение должно быть не больше 8 МБ.");
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Не удалось открыть изображение. Выбери другой файл."));
    img.src = source;
  });
  if (
    !image.naturalWidth ||
    !image.naturalHeight ||
    image.naturalWidth * image.naturalHeight > 25000000
  )
    throw new Error("Выбери изображение размером до 25 мегапикселей.");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не смог обработать изображение.");
  const size = Math.min(image.naturalWidth, image.naturalHeight);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 256, 256);
  context.drawImage(
    image,
    (image.naturalWidth - size) / 2,
    (image.naturalHeight - size) / 2,
    size,
    size,
    0,
    0,
    256,
    256,
  );
  const result = canvas.toDataURL("image/jpeg", 0.85);
  if (!result.startsWith("data:image/jpeg;base64,") || result.length > 200000)
    throw new Error("Не удалось подготовить аватарку. Выбери другой файл.");
  return result;
}
