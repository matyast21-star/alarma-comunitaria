package cl.fluva.veci;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/** Canal de notificación con la sirena de VECI+ (suena con el volumen de alarma). */
final class Alarma {
    static final String CANAL = "veci_alarma_v1";

    static Uri sonido(Context c) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + c.getPackageName() + "/" + R.raw.sirena);
    }

    static void crearCanal(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
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
