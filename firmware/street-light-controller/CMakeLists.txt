# Smart Street Light Controller firmware (ESP32-S3, ESP-IDF v5.4)
cmake_minimum_required(VERSION 3.16)

# Reported in telemetry (`device.firmwareVersion`) and used for OTA version checks.
set(PROJECT_VER "0.1.0")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(street-light-controller)
