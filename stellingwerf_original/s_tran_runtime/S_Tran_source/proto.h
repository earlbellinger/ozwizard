/*  proto.h - sphlib prototypes  */
/*  $Id$  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*---ascdate---*/
char *ascdate( void );
double dec_date( char *date_str );
int cindex( char *string, char *key );

/*---eval---*/
double exptof( char *instring );
int exptoi( char *instring );
int register_user_fn( char *name, char *exp );
int register_user_var( char *name, char *val, int init );
double lookup_user_var( char *str );
void cleanup_vars( void );
void eval_indices( char *exp );

/*---parse_file---*/
int read_input_file( char* file, int (*f)(char *command, int nargs,	char args[MAX_ARGS+1][FIELD_LEN+1]), char *label );
int item( int n, char *item, int item_len, char *buffer, int buffer_len );

/*---command---*/
int process_cmds( char *command, int nargs, char args[MAX_ARGS+1][FIELD_LEN+1] );

/*---sys---*/
double get_cpu_time( void );
double rnd( void );
double drnd( void );
void srnd( int seed );
int iran( int n, int m );
double ran1(long *idum);
int check_input( unsigned *key );
double exp2( double x );
double exp10( double x );
double logc( double x );
double log10c( double x );
double sqrtc( double x );
void error( char *s );
void do_exit( int stat );
void do_error( char *err_msg );
int fgetline( FILE *fp, char *buffer, int max_len );
int fgetstr( FILE *fp, char *buffer, int max_len );
int fiseek( FILE *fp, int offset );
double round( double x );
char *substring( char *tmp1, char *tmp2, char *tmp3 );

/*----csv----*/
int close_csv_file( char *file );
void set_delim( char dlm );
int write_vars( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] );
int write_vars_str( char *file, char *str, int nl );
int read_var0( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] );
int read_vars( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] );
void close_data_file( void );
int write_csv_header( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1]);
int write_csv_data( double data[MAX_FIELDS+1], int num );
int read_list( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] );
int read_csv_header( char *file, int nargs, char labels[MAX_FIELDS+1][FIELD_LEN+1] );
int read_csv_data( int nargs, char labels[MAX_FIELDS+1][FIELD_LEN+1] );
int read_csv_data_2( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] );
int item_dat( int n, char *item, int item_len, char *buffer, int buffer_len );

/*----MultReg----*/
int read_csv_data_3( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] );
int set_stat_data( void );
double fv( int i, int j, int rlog );
int mult_regress( void );

/*----Factor----*/
int factor( void );
double *dvector(int nl, int nh);
void free_dvector(double *v, long nl, long nh);
double **dmatrix(int nrl, int nrh, int ncl, int nch);
void free_dmatrix(double **m, long nrl, long nrh, long ncl, long nch);

/*----Coranal/Cluster/solver----*/
int coranal( void );
int cluster( void );
int solvem( int n, double a[MAX_FIELDS+1][MAX_FIELDS+1], double b[MAX_FIELDS+1], double x[MAX_FIELDS+1] );
int set_solve_data( void );

/*----Sort----*/
int set_sort_data( char *var );
int h_sort( int n, int m, double dat[MAX_LINES+1][MAX_FIELDS+1] );

/*----Period Analysis----*/
int pdm( int ne, double datx[], double daty[], double sig[] );
int pdm2( int ne, double datx[], double daty[], double sig[] );
int pdm2b( int ne, double datx[], double daty[], double sig[] );
int p_sort( int n, double dat1[], double dat2[], double dat3[], int sgn );
void lomb( int n, double x[], double y[] );
