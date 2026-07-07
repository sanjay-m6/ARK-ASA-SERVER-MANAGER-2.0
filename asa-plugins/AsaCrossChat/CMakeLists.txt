cmake_minimum_required(VERSION 3.20)
project(AsaCrossChat LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Configure output directories
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

# Define Plugin source
add_library(AsaCrossChat SHARED
    AsaCrossChat.cpp
)

# Target Properties
set_target_properties(AsaCrossChat PROPERTIES
    PREFIX ""
    SUFFIX ".dll"
)

# Define preprocessors needed for Windows/AsaApi
target_compile_definitions(AsaCrossChat PRIVATE
    _USRDLL
    ASACROSSCHAT_EXPORTS
    UNICODE
    _UNICODE
    WIN32_LEAN_AND_MEAN
)

# Include directories
target_include_directories(AsaCrossChat PRIVATE
    ${PROJECT_SOURCE_DIR}/include
    "C:/AsaApi/include"
    "C:/Program Files/MySQL/MySQL Connector C 6.1/include"
    "C:/Program Files/MySQL/MySQL Server 8.0/include"
)

# Link libraries
target_link_libraries(AsaCrossChat PRIVATE
    "C:/AsaApi/lib/AsaApi.lib"
    ws2_32.lib
    winhttp.lib
    "C:/Program Files/MySQL/MySQL Connector C 6.1/lib/libmysql.lib"
    "C:/Program Files/MySQL/MySQL Server 8.0/lib/libmysql.lib"
)
