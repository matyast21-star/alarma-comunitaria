package cl.fluva.veci;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Pantalla de inicio: crea el canal de alarma y abre la página de VECI+. */
public class AppVeci extends LauncherActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Alarma.crearCanal(this);
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
        super.onCreate(savedInstanceState);
    }
}
