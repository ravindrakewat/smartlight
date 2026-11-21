# No REQUIRES: the `main` component may depend on every ESP-IDF component.
idf_component_register(
    SRCS
        "main.c"
        "sl_app.c"
        "sl_config.c"
        "sl_mqtt.c"
        "sl_net.c"
        "sl_output.c"
        "sl_sensors.c"
    INCLUDE_DIRS "include"
)
