package cl.fluva.veci;

import android.app.Notification;
import android.app.NotificationManager;
import android.media.AudioManager;
import android.os.Build;

import androidx.annotation.NonNull;

import com.google.androidbrowserhelper.trusted.DelegationService;

/**
 * Chrome entrega aquí las notificaciones de la página. Las mostramos en el canal
 * de VECI+: el robo suena con la sirena (volumen de alarma, se repite hasta atenderla)
 * y los avisos de actividad inusual con una campanita suave.
 */
public class AlarmaService extends DelegationService {

    @Override
    public boolean onNotifyNotificationWithChannel(@NonNull String platformTag, int platformId,
            @NonNull Notification notification, @NonNull String channelName) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (!nm.areNotificationsEnabled()) return false;

        CharSequence titulo = notification.extras != null ? notification.extras.getCharSequence(Notification.EXTRA_TITLE) : null;
        boolean robo = titulo != null && titulo.toString().toUpperCase().contains("ROBO");

        Notification n;
        if (Build.VERSION.SDK_INT >= 26) {
            Alarma.crearCanal(this);
            n = Notification.Builder.recoverBuilder(this, notification)
                    .setChannelId(robo ? Alarma.CANAL : Alarma.CANAL_AVISO)
                    .setCategory(robo ? Notification.CATEGORY_ALARM : Notification.CATEGORY_MESSAGE)
                    .build();
        } else {
            n = notification;
            n.sound = robo ? Alarma.sonido(this) : Alarma.sonidoAviso(this);
            n.audioStreamType = robo ? AudioManager.STREAM_ALARM : AudioManager.STREAM_NOTIFICATION;
            n.priority = Notification.PRIORITY_MAX;
            n.vibrate = robo ? new long[]{0, 900, 300, 900, 300, 900} : new long[]{0, 300, 150, 300};
        }

        if (robo) n.flags |= Notification.FLAG_INSISTENT; // la sirena se repite hasta atender la alerta

        nm.notify(platformTag, platformId, n);
        return true;
    }
}
