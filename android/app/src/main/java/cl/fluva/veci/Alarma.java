package cl.fluva.veci;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * Canales de notificación de VECI+:
 *  - ROBO: sirena con el volumen de alarma.
 *  - AVISO: campanita suave para actividad inusual y avisos generales.
 */
final class Alarma {
    static final String CANAL = "veci_alarma_v1";
    static final String CANAL_AVISO = "veci_aviso_v1";

    static Uri sonido(Context c) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + c.getPackageName() + "/" + R.raw.sirena);
    }

    static Uri sonidoAviso(Context c) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + c.getPackageName() + "/" + R.raw.aviso);
    }

    static void crearCanal(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CANAL_AVISO) == null) {
            NotificationChannel aviso = new NotificationChannel(CANAL_AVISO, "Avisos de los vecinos", NotificationManager.IMPORTANCE_HIGH);
            aviso.setDescription("Actividad inusual y avisos generales, con un sonido suave");
            aviso.setSound(sonidoAviso(c), new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            aviso.enableVibration(true);
            aviso.setVibrationPattern(new long[]{0, 300, 150, 300});
            aviso.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(aviso);
        }
        if (nm.getNotificationChannel(CANAL) != null) return;
        NotificationChannel canal = new NotificationChannel(CANAL, "Alarmas de la comunidad", NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription("Alertas de robo y avisos de los vecinos, con sirena");
        canal.setSound(sonido(c), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        canal.enableVibration(true);
        canal.setVibrationPattern(new long[]{0, 900, 300, 900, 300, 900, 300, 900});
        canal.enableLights(true);
        canal.setLightColor(0xFFFF0000);
        canal.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        canal.setBypassDnd(true);
        nm.createNotificationChannel(canal);
    }

    private Alarma() {}
}
