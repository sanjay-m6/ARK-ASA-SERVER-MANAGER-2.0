cmake_minimum_required(VERSION 3.20)
project(AsaCombatMetrics LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Configure output directories
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

# Define Plugin source
add_library(AsaCombatMetrics SHARED
    AsaCombatMetrics.cpp
)

# Target Properties
set_target_properties(AsaCombatMetrics PROPERTIES
    PREFIX ""
    SUFFIX ".dll"
)

# Define preprocessors needed for Windows/AsaApi
target_compile_definitions(AsaCombatMetrics PRIVATE
    _USRDLL
    ASACOMBATMETRICS_EXPORTS
    UNICODE
    _UNICODE
    WIN32_LEAN_AND_MEAN
)

# User must configure these paths to match their server API setup
# e.g., C:/AsaApi/Header/Files and C:/AsaApi/Libs/AsaApi.lib
target_include_directories(AsaCombatMetrics PRIVATE
    ${PROJECT_SOURCE_DIR}/include
    "C:/AsaApi/include"
)

target_link_libraries(AsaCombatMetrics PRIVATE
    "C:/AsaApi/lib/AsaApi.lib"
    ws2_32.lib
    winhttp.lib
)
