package cl.fluva.veci;

import android.app.Notification;
import android.app.NotificationManager;
import android.media.AudioManager;
import android.os.Build;

import androidx.annotation.NonNull;

import com.google.androidbrowserhelper.trusted.DelegationService;

/**
 * Chrome entrega aquí las notificaciones de la página. Las mostramos en el canal
 * "Alarmas de la comunidad", que suena con la sirena de VECI+ aunque el teléfono
 * esté bloqueado. Las alertas de robo repiten la sirena hasta que se abre o descarta.
 */
public class AlarmaService extends DelegationService {

    @Override
    public boolean onNotifyNotificationWithChannel(@NonNull String platformTag, int platformId,
            @NonNull Notification notification, @NonNull String channelName) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (!nm.areNotificationsEnabled()) return false;

        Notification n;
        if (Build.VERSION.SDK_INT >= 26) {
            Alarma.crearCanal(this);
            n = Notification.Builder.recoverBuilder(this, notification)
                    .setChannelId(Alarma.CANAL)
                    .setCategory(Notification.CATEGORY_ALARM)
                    .build();
        } else {
            n = notification;
            n.sound = Alarma.sonido(this);
            n.audioStreamType = AudioManager.STREAM_ALARM;
            n.priority = Notification.PRIORITY_MAX;
            n.vibrate = new long[]{0, 900, 300, 900, 300, 900};
        }

        CharSequence titulo = n.extras != null ? n.extras.getCharSequence(Notification.EXTRA_TITLE) : null;
        if (titulo != null && titulo.toString().toUpperCase().contains("ROBO")) {
            n.flags |= Notification.FLAG_INSISTENT; // la sirena se repite hasta atender la alerta
        }

        nm.notify(platformTag, platformId, n);
        return true;
    }
}
