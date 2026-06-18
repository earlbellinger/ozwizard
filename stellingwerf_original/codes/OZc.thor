// Specify the data objects.
create_data_object  Points 
{
    type csv_file ozc.csv
}
end_data_object



// Specify the plot objects.
create_plot_object  Points 
{
    add_data_object 0
    clip_to_axes
    draw_box TRUE
    draw_grid FALSE
    show_axes TRUE
    draw_xaxis TRUE
    draw_yaxis TRUE
    draw_zaxis TRUE
    draw_xtics TRUE
    draw_ytics TRUE
    draw_ztics TRUE
    draw_ex_xtics TRUE
    draw_ex_ytics TRUE
    draw_ex_ztics TRUE
    axis_red_value 0
    axis_green_value 0
    axis_blue_value 0
    xlabel_scale 1.000000e+000
    ylabel_scale 1.000000e+000
    zlabel_scale 1.000000e+000
    xnumber_scale 1.000000e+000
    ynumber_scale 1.000000e+000
    znumber_scale 1.000000e+000
    xlabel T
    ylabel X
    zlabel T
    angle_x 0.000000e+000
    angle_y 0.000000e+000
    angle_z 0.000000e+000
    trans_x 9.000000e-002
    trans_y 0.000000e+000
    trans_z -3.500000e+000
    pan_x 2.561388e-004
    pan_y 1.478838e-002
    pan_z 0.000000e+000
    scale_x 9.190620e-001
    scale_y 9.190620e-001
    scale_z 9.190620e-001
    zoom_x 1.000000e+000
    zoom_y 1.000000e+000
    zoom_z 1.000000e+000
    plot_lines true
    pen_up 0.000000e+000
    ma_win 0
    line_width 1.000000e+000
    canvas_width 950
    canvas_height 388
    global_curvecol true
    plot_points false
    point_size 4.000000e+000
    round_points true
    smooth_points true
    reflectx false
    reflecty false
    reflectz false
    reflect_fill true
    rev_plot false
    plot_cubes false
    plot_polygons true
    shaded_polygons true
    plot_nodes false
    plot_edges false
    stored_cubes false
    dynamic_cubes true
    title_size 5.000000
    show_title true
    title1_from_data true
    title1 
    use_title2 false
    title2 
    include_time_title1 false
    time_place1 1
    include_time_title2 false
    time_place2 1
    time_prepend , Time = 
    time_format %.3g 
    time_append \gms 
    time_mult 1.000000e+006
    two_d_flag true
    add_curve 0 0 0 1 0 0 0 1 1 0
    add_curve 0 1 0 2 0 0 0 1 2 0
    add_curve 0 2 0 3 0 0 0 1 2 0
    add_curve 0 3 0 4 0 0 0 1 2 0
    add_curve 0 4 0 4 0 0 0 1 2 0
    add_curve 0 5 0 4 0 0 0 1 2 0
    add_curve 0 6 0 6 0 0 0 1 2 0
    add_curve 0 7 0 7 0 0 0 1 2 0
}
end_plot_object

create_plot_object  Sequence 
{
    add_data_object 0
    clip_to_axes
    draw_box TRUE
    draw_grid FALSE
    show_axes TRUE
    draw_xaxis TRUE
    draw_yaxis TRUE
    draw_zaxis TRUE
    draw_xtics TRUE
    draw_ytics TRUE
    draw_ztics TRUE
    draw_ex_xtics TRUE
    draw_ex_ytics TRUE
    draw_ex_ztics TRUE
    axis_red_value 0
    axis_green_value 0
    axis_blue_value 0
    xlabel_scale 1.000000e+000
    ylabel_scale 1.000000e+000
    zlabel_scale 1.000000e+000
    xnumber_scale 1.000000e+000
    ynumber_scale 1.000000e+000
    znumber_scale 1.000000e+000
    xlabel X Axis 
    ylabel Y Axis 
    zlabel Z Axis 
    angle_x 0.000000e+000
    angle_y 0.000000e+000
    angle_z 0.000000e+000
    trans_x 0.000000e+000
    trans_y 0.000000e+000
    trans_z -3.500000e+000
    pan_x 0.000000e+000
    pan_y 0.000000e+000
    pan_z 0.000000e+000
    scale_x 8.000000e-001
    scale_y 8.000000e-001
    scale_z 8.000000e-001
    zoom_x 1.000000e+000
    zoom_y 1.000000e+000
    zoom_z 1.000000e+000
    plot_lines true
    pen_up 0.000000e+000
    ma_win 0
    line_width 1.000000e+000
    canvas_width 950
    canvas_height 388
    global_curvecol true
    plot_points false
    point_size 4.000000e+000
    round_points true
    smooth_points true
    reflectx false
    reflecty false
    reflectz false
    reflect_fill true
    rev_plot false
    plot_cubes false
    plot_polygons true
    shaded_polygons true
    plot_nodes false
    plot_edges false
    stored_cubes false
    dynamic_cubes true
    title_size 5.000000
    show_title true
    title1_from_data true
    title1 
    use_title2 false
    title2 
    include_time_title1 false
    time_place1 1
    include_time_title2 false
    time_place2 1
    time_prepend , Time = 
    time_format %.3g 
    time_append \gms 
    time_mult 1.000000e+006
    two_d_flag true
    add_curve 0 0 1 1 0 0 0 1 1 0
}
end_plot_object



// Specify the scenes.
create_scene  Points 
{
    add_plot_object 0
}
end_scene_object

create_scene  Scene 1 
{
    add_plot_object 0
    add_plot_object 1
    tile_plot_objects true
}
end_scene_object



// Specify the minmax objects.
modify_minmax_object  0
{
    minmax_xvalues 0.000000e+000 0.000000e+000
    minmax_yvalues 0.000000e+000 2.000000e+000
    minmax_zvalues 0.000000e+000 0.000000e+000
    minmax_xflags false false
    minmax_yflags false false
    minmax_zflags false false
}
end_minmax_object



// Specify the minmax objs for the plot objs.
plot_object_minmax  0  0
plot_object_minmax  1  0


// Specify the allwith objects.


// Specify the allwith objs for the plot objs.


// Specify the colorbar data objects.
modify_cbdata_object  0
{
    cmin 0.000000e+000
    cmax 8.000000e+000
    icmin 0
    icmax 7
    xlocation 1.000000e+000
    ylocation -1.000000e+000
    width 5.000000e-002
    height 2.000000e+000
    cbar_vmin 0.000000e+000
    cbar_vmax 0.000000e+000
    showing true
    vmin_scale true
    vmax_scale true
}
end_cbdata_object



// Specify the cbdata objs for the plot objs.
plot_object_cbdata  0  0
plot_object_cbdata  1  0


// Global settings
draw_accel 3
rotate_mode 2


// White canvases 
do_white_bkg

// Specify the current scene.
current_scene 0
