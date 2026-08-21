import { useEffect, useState } from 'react';
import axiosInstance from '../../utils/axiosConfig';
import type { WhatsAppMessage } from '../../stores/whatsappStore';

function WhatsAppMedia({ message }: { message: WhatsAppMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      if (!message.local_filename && !message.graph_media_id) {
        setMissing(true);
        return;
      }
      try {
        const res = await axiosInstance.get(`/whatsapp/media/${message.id}`, {
          responseType: 'blob',
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
        setMissing(false);
      } catch {
        if (!cancelled) setMissing(true);
      }
    };

    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id, message.local_filename, message.graph_media_id]);

  if (missing && !url) {
    return <p className="text-xs text-gray-400 italic">Media is still downloading or unavailable.</p>;
  }
  if (!url) return <p className="text-xs text-gray-400">Loading media…</p>;
  if (message.type === 'image' || message.type === 'sticker') {
    return <img src={url} alt={message.body || 'WhatsApp image'} className="max-w-full max-h-72 rounded-md" />;
  }
  if (message.type === 'audio') return <audio src={url} controls className="w-full max-w-xs" />;
  if (message.type === 'video') return <video src={url} controls className="max-w-full max-h-72 rounded-md" />;
  return (
    <a href={url} download={message.filename || 'whatsapp-file'} className="text-blue-300 underline text-sm">
      {message.filename || 'Download file'}
    </a>
  );
}

export default WhatsAppMedia;
